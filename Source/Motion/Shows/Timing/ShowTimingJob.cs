// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Collections.Immutable;
using Cratis.Chronicle;
using Cratis.Monads;
using Cratis.Orleans;
using Cratis.Orleans.Jobs;
using Cratis.Orleans.Storage.Jobs;
using Motion.AI;
using Motion.Jobs;
using Motion.Shows.Planning;
using Motion.Speech;
using Orleans.Runtime;

namespace Motion.Shows.Timing;

/// <summary>
/// Defines the grain for <see cref="ShowTimingJob"/>.
/// </summary>
public interface IShowTimingJob : IJob<ShowTimingRequest>;

/// <summary>
/// Defines the grain for <see cref="TimeShowStep"/>.
/// </summary>
public interface ITimeShowStep : IJobStep<ShowTimingRequest, object, TimeShowStepState>, IJobObserver;

/// <summary>
/// What <see cref="ShowTimingJob"/> was asked to do - align the words of one show's narration to
/// its voiceover. A duration of zero means read it from the voiceover WAV (an explicit re-time).
/// </summary>
public record ShowTimingRequest(string ShowId, double DurationSeconds) : IJobRequest;

/// <summary>
/// The persisted state for <see cref="TimeShowStep"/>.
/// </summary>
public class TimeShowStepState : JobStepState
{
    /// <summary>Gets or sets the identity of the show being timed.</summary>
    public string ShowId { get; set; } = string.Empty;

    /// <summary>Gets or sets the voiceover duration in seconds - zero to read from the WAV.</summary>
    public double DurationSeconds { get; set; }
}

/// <summary>
/// Times the narration: transcribes the voiceover with word-level timings, derives scene windows
/// from the pauses, and appends <see cref="ShowTimed"/>.
/// </summary>
public class ShowTimingJob : Job<ShowTimingRequest, JobState>, IShowTimingJob
{
    /// <inheritdoc/>
    protected override Task<IImmutableList<JobStepDetails>> PrepareSteps(ShowTimingRequest request) =>
        Task.FromResult<IImmutableList<JobStepDetails>>(ImmutableList.Create(CreateStep<ITimeShowStep>(request)));

    /// <inheritdoc/>
    protected override JobDetails GetJobDetails() => "Time the narration to the audio";
}

/// <summary>
/// Produces and records the timing for one show.
/// </summary>
/// <param name="state"><see cref="IPersistentState{TState}"/> for the step's own bookkeeping.</param>
/// <param name="throttle">The <see cref="IJobStepThrottle"/> limiting parallel execution.</param>
/// <param name="logger">The logger.</param>
/// <param name="scopeFactory">The scope services are resolved from - a step runs outside any request.</param>
/// <param name="chronicleClient">The <see cref="IChronicleClient"/> the timing is appended through.</param>
public class TimeShowStep(
    [PersistentState(nameof(TimeShowStepState), WellKnownGrainStorageProviders.JobSteps)] IPersistentState<TimeShowStepState> state,
    IJobStepThrottle throttle,
    ILogger<TimeShowStep> logger,
    IServiceScopeFactory scopeFactory,
    IChronicleClient chronicleClient)
    : JobStep<ShowTimingRequest, object, TimeShowStepState>(state, throttle, logger), ITimeShowStep
{
    /// <inheritdoc/>
    protected override Task<Result<PrepareJobStepError>> PrepareStep(ShowTimingRequest request) =>
        Task.FromResult(Result<PrepareJobStepError>.Success());

    /// <inheritdoc/>
    protected override ValueTask InitializeState(ShowTimingRequest request)
    {
        State.ShowId = request.ShowId;
        State.DurationSeconds = request.DurationSeconds;
        return ValueTask.CompletedTask;
    }

    /// <inheritdoc/>
    protected override async Task<Catch<JobStepResult>> PerformStep(TimeShowStepState currentState, CancellationToken cancellationToken)
    {
        var showId = ShowId.From(Guid.Parse(currentState.ShowId));

        await using var scope = scopeFactory.CreateAsyncScope();
        var services = scope.ServiceProvider;
        var transcriber = services.GetRequiredService<ISpeechTranscriber>();
        var artifactStore = services.GetRequiredService<ShowArtifactStore>();

        var planJson = ShowArtifactStore.ReadTextOrNull(artifactStore.PlanJson(showId))
            ?? throw new ShowPlanningFailed("The show has no plan - plan it first.");
        var plan = ShowPlanner.Deserialize(planJson) ?? throw new ShowPlanningFailed("The stored plan could not be read.");
        var wavPath = artifactStore.VoiceoverWav(showId);
        if (!File.Exists(wavPath)) throw new SpeechTranscriptionFailed("The voiceover WAV is missing - synthesize the voice first.");

        var audioDuration = currentState.DurationSeconds > 0 ? currentState.DurationSeconds : Wav.ReadDuration(wavPath);

        // collect the lyric lines: one per sentence, tagged with the positional scene id
        var lines = new List<(string SceneId, string Text, double WindowStart, double WindowEnd)>();
        double windowStart = 0;
        const double SceneGap = 0.45;
        for (var i = 0; i < plan.Scenes.Count; i++)
        {
            var spoken = plan.Scenes[i].Spoken.Trim();
            if (spoken.Length == 0) continue;
            foreach (var sentence in ShowTimingData.SplitIntoLines(spoken))
            {
                lines.Add(($"scene-{i + 1}", sentence, windowStart, windowStart + EstimateDuration(sentence)));
            }
            windowStart += EstimateDuration(spoken) + SceneGap;
        }

        var words = transcriber.IsEnabled
            ? await transcriber.TranscribeWithWordTimings(wavPath, cancellationToken)
            : [];

        var lyricsJson = ShowTimingData.BuildLyricsJson(lines, words, audioDuration);
        ShowArtifactStore.WriteText(artifactStore.LyricsJson(showId), lyricsJson);
        var audioAnalysisJson = ShowTimingData.BuildAudioAnalysisJson(wavPath, lyricsJson);
        ShowArtifactStore.WriteText(artifactStore.AudioAnalysisJson(showId), audioAnalysisJson);

        await JobStepAppender.Append(this, chronicleClient, showId.Value, new ShowTimed(lyricsJson));
        return JobStepResult.Succeeded();
    }

    /// <inheritdoc/>
    protected override ValueTask<object?> CreateCancelledResultFromCurrentState(TimeShowStepState currentState) =>
        ValueTask.FromResult<object?>(null);

    static double EstimateDuration(string text)
    {
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
        return Math.Max(0.6, words * 0.34);
    }
}
