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
public record VoiceoverSynthesisRequest(string ShowId, bool Render = true) : IJobRequest;

/// <summary>
/// The persisted state for <see cref="SynthesizeVoiceoverStep"/>.
/// </summary>
public class SynthesizeVoiceoverStepState : JobStepState
{
    /// <summary>Gets or sets the identity of the show being spoken.</summary>
    public string ShowId { get; set; } = string.Empty;
    public bool Render { get; set; } = true;
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
        State.Render = request.Render;
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

        await JobStepAppender.Append(this, chronicleClient, showId.Value, new VoiceoverSynthesized(audioPath, duration, currentState.Render));
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

        var takesFolder = artifactStore.VoiceoverFolderFor(showId);
        foreach (var stale in Directory.EnumerateFiles(takesFolder, "scene-*.wav")) File.Delete(stale);

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

        // assemble: 0.45s of air between scenes, recording each scene's exact offset
        var finalWav = artifactStore.VoiceoverWav(showId);
        (int Channels, int SampleRate)? format = null;
        var sceneDocs = new List<object>();
        var takeIndex = 0;
        double offset = 0;
        await using (var target = WavWriter.Create(finalWav))
        {
            for (var i = 0; i < plan.Scenes.Count; i++)
            {
                var spoken = plan.Scenes[i].Spoken.Trim();
                if (spoken.Length == 0) continue;
                var take = takePaths[takeIndex];
                if (takeIndex > 0) WavWriter.AppendSilence(target, format!.Value, SceneGapSeconds);
                offset += takeIndex > 0 ? SceneGapSeconds : 0;
                var takeDuration = Wav.ReadDuration(take);
                sceneDocs.Add(new
                {
                    index = i + 1,
                    sceneId = $"scene-{i + 1}",
                    file = $"voiceover/scene-{i + 1:00}.wav",
                    duration = Math.Round(takeDuration, 3),
                    offset = Math.Round(offset, 3),
                    spoken,
                });
                WavWriter.Append(take, target, ref format);
                offset += takeDuration;
                takeIndex++;
            }
            WavWriter.Finalize(target, format!.Value);
        }
        var duration = Wav.ReadDuration(finalWav);

        // the per-scene manifest the storyboard and the per-scene player consume
        ShowArtifactStore.WriteText(
            artifactStore.ScenesJson(showId),
            System.Text.Json.JsonSerializer.Serialize(new { scenes = sceneDocs, duration = Math.Round(duration, 3) },
                new System.Text.Json.JsonSerializerOptions { PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower, WriteIndented = true }));

        // mp3 for playback and packaging; wav when ffmpeg is missing (engine and renderer handle both)
        var mp3 = artifactStore.VoiceoverAudio(showId);
        return ffmpeg.ConvertToMp3(finalWav, mp3)
            ? ("voiceover.mp3", duration)
            : ("voiceover.wav", duration);
    }
}
