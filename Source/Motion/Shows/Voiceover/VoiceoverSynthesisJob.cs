// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Collections.Immutable;
using Cratis.Chronicle;
using Cratis.Monads;
using Cratis.Orleans;
using Cratis.Orleans.Jobs;
using Cratis.Orleans.Storage.Jobs;
using MongoDB.Driver;
using Motion.AI;
using Motion.Jobs;
using Motion.Shows.Listing;
using Motion.Shows.Packaging;
using Motion.Shows.Planning;
using Motion.Speech;
using Orleans.Runtime;

namespace Motion.Shows.Voiceover;

/// <summary>
/// Defines the grain for <see cref="VoiceoverSynthesisJob"/>.
/// </summary>
public interface IVoiceoverSynthesisJob : IJob<VoiceoverSynthesisRequest>;

/// <summary>
/// Defines the grain for <see cref="SynthesizeVoiceoverStep"/>.
/// </summary>
public interface ISynthesizeVoiceoverStep : IJobStep<VoiceoverSynthesisRequest, object, SynthesizeVoiceoverStepState>, IJobObserver;

/// <summary>
/// What <see cref="VoiceoverSynthesisJob"/> was asked to do - speak one show.
/// </summary>
public record VoiceoverSynthesisRequest(string ShowId) : IJobRequest;

/// <summary>
/// The persisted state for <see cref="SynthesizeVoiceoverStep"/>.
/// </summary>
public class SynthesizeVoiceoverStepState : JobStepState
{
    /// <summary>Gets or sets the identity of the show being spoken.</summary>
    public string ShowId { get; set; } = string.Empty;
}

/// <summary>
/// Speaks the planned show: synthesizes each scene's narration, joins the takes with a breath of
/// silence between scenes, writes the voiceover WAV (and MP3 when ffmpeg is present), and appends
/// <see cref="VoiceoverSynthesized"/>.
/// </summary>
public class VoiceoverSynthesisJob : Job<VoiceoverSynthesisRequest, JobState>, IVoiceoverSynthesisJob
{
    /// <inheritdoc/>
    protected override Task<IImmutableList<JobStepDetails>> PrepareSteps(VoiceoverSynthesisRequest request) =>
        Task.FromResult<IImmutableList<JobStepDetails>>(ImmutableList.Create(CreateStep<ISynthesizeVoiceoverStep>(request)));

    /// <inheritdoc/>
    protected override JobDetails GetJobDetails() => "Speak the show's narration";
}

/// <summary>
/// Synthesizes and records the voiceover for one show.
/// </summary>
/// <param name="state"><see cref="IPersistentState{TState}"/> for the step's own bookkeeping.</param>
/// <param name="throttle">The <see cref="IJobStepThrottle"/> limiting parallel execution.</param>
/// <param name="logger">The logger.</param>
/// <param name="scopeFactory">The scope services are resolved from - a step runs outside any request.</param>
/// <param name="chronicleClient">The <see cref="IChronicleClient"/> the voiceover is appended through.</param>
public class SynthesizeVoiceoverStep(
    [PersistentState(nameof(SynthesizeVoiceoverStepState), WellKnownGrainStorageProviders.JobSteps)] IPersistentState<SynthesizeVoiceoverStepState> state,
    IJobStepThrottle throttle,
    ILogger<SynthesizeVoiceoverStep> logger,
    IServiceScopeFactory scopeFactory,
    IChronicleClient chronicleClient)
    : JobStep<VoiceoverSynthesisRequest, object, SynthesizeVoiceoverStepState>(state, throttle, logger), ISynthesizeVoiceoverStep
{
    const double SceneGapSeconds = 0.45;

    /// <inheritdoc/>
    protected override Task<Result<PrepareJobStepError>> PrepareStep(VoiceoverSynthesisRequest request) =>
        Task.FromResult(Result<PrepareJobStepError>.Success());

    /// <inheritdoc/>
    protected override ValueTask InitializeState(VoiceoverSynthesisRequest request)
    {
        State.ShowId = request.ShowId;
        return ValueTask.CompletedTask;
    }

    /// <inheritdoc/>
    protected override async Task<Catch<JobStepResult>> PerformStep(SynthesizeVoiceoverStepState currentState, CancellationToken cancellationToken)
    {
        var showId = ShowId.From(Guid.Parse(currentState.ShowId));
        try
        {
        await using var scope = scopeFactory.CreateAsyncScope();
        var services = scope.ServiceProvider;
        var synthesizer = services.GetRequiredService<ISpeechSynthesizer>();
        var ffmpeg = services.GetRequiredService<IFfmpeg>();
        var artifactStore = services.GetRequiredService<ShowArtifactStore>();
        var shows = services.GetRequiredService<IMongoCollection<Show>>();

        var planJson = ShowArtifactStore.ReadTextOrNull(artifactStore.PlanJson(showId))
            ?? throw new ShowPlanningFailed("The show has no plan to speak - plan it first.");

        var voice = await VoiceOf(shows, showId);
        var (audioPath, duration) = await Synthesize(synthesizer, ffmpeg, artifactStore, showId, planJson, voice, cancellationToken);

        await JobStepAppender.Append(this, chronicleClient, showId.Value, new VoiceoverSynthesized(audioPath, duration));
        return JobStepResult.Succeeded();
        }
        catch (Exception exception)
        {
            var message = await JobStepAppender.ReportFailure(this, chronicleClient, showId.Value, "voice", exception, logger);
            return JobStepResult.Failed(message);
        }
    }

    /// <inheritdoc/>
    protected override ValueTask<object?> CreateCancelledResultFromCurrentState(SynthesizeVoiceoverStepState currentState) =>
        ValueTask.FromResult<object?>(null);

    static async Task<string> VoiceOf(IMongoCollection<Show> shows, ShowId showId)
    {
        // On a cold boot the read model can lag the kernel by a few seconds while the MongoDB
        // replica set finishes electing; retry rather than fail the stage on that race.
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                var show = await shows.Find(s => s.Id == showId).FirstOrDefaultAsync();
                return show?.Voice ?? string.Empty;
            }
            catch (Exception ex) when (attempt < 5 && ex.Message.Contains("timeout occurred", StringComparison.OrdinalIgnoreCase))
            {
                await Task.Delay(5000);
            }
        }
    }

    static async Task<(string AudioPath, double Duration)> Synthesize(
        ISpeechSynthesizer synthesizer,
        IFfmpeg ffmpeg,
        ShowArtifactStore artifactStore,
        ShowId showId,
        string planJson,
        string voice,
        CancellationToken cancellationToken)
    {
        if (!synthesizer.IsEnabled)
        {
            throw new SpeechSynthesisFailed(
                "No text-to-speech service is configured. Set Cratis:Motion:Tts in appsettings.local.json " +
                "(an OpenAI-compatible /v1/audio/speech endpoint, e.g. Kokoro-FastAPI on :8880).");
        }
        var plan = ShowPlanner.Deserialize(planJson) ?? throw new ShowPlanningFailed("The stored plan could not be read.");

        var takesFolder = Path.Combine(artifactStore.FolderFor(showId), "takes");
        if (Directory.Exists(takesFolder)) Directory.Delete(takesFolder, true);
        Directory.CreateDirectory(takesFolder);

        // synthesize one take per scene (scenes with no spoken text contribute only a gap)
        var takePaths = new List<string>();
        for (var i = 0; i < plan.Scenes.Count; i++)
        {
            var spoken = plan.Scenes[i].Spoken.Trim();
            if (spoken.Length == 0) continue;
            var take = Path.Combine(takesFolder, $"scene-{i + 1:00}.wav");
            await synthesizer.SynthesizeToWav(spoken, take, cancellationToken, voice);
            takePaths.Add(take);
        }
        if (takePaths.Count == 0) throw new SpeechSynthesisFailed("The plan has no spoken narration at all.");

        // assemble: 0.45s of air between scenes
        var finalWav = artifactStore.VoiceoverWav(showId);
        (int Channels, int SampleRate)? format = null;
        await using (var target = WavWriter.Create(finalWav))
        {
            for (var i = 0; i < takePaths.Count; i++)
            {
                if (i > 0) WavWriter.AppendSilence(target, format!.Value, SceneGapSeconds);
                WavWriter.Append(takePaths[i], target, ref format);
            }
            WavWriter.Finalize(target, format!.Value);
        }
        var duration = Wav.ReadDuration(finalWav);

        // mp3 for playback and packaging; wav when ffmpeg is missing (engine and renderer handle both)
        var mp3 = artifactStore.VoiceoverAudio(showId);
        return ffmpeg.ConvertToMp3(finalWav, mp3)
            ? ("voiceover.mp3", duration)
            : ("voiceover.wav", duration);
    }
}
