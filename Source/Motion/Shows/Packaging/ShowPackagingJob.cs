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

namespace Motion.Shows.Packaging;

/// <summary>
/// Defines the grain for <see cref="ShowPackagingJob"/>.
/// </summary>
public interface IShowPackagingJob : IJob<ShowPackagingRequest>;

/// <summary>
/// Defines the grain for <see cref="PackageShowStep"/>.
/// </summary>
public interface IPackageShowStep : IJobStep<ShowPackagingRequest, object, PackageShowStepState>, IJobObserver;

/// <summary>
/// What <see cref="ShowPackagingJob"/> was asked to do - package one show for the engine.
/// </summary>
public record ShowPackagingRequest(string ShowId, bool Render = true) : IJobRequest;

/// <summary>
/// The persisted state for <see cref="PackageShowStep"/>.
/// </summary>
public class PackageShowStepState : JobStepState
{
    /// <summary>Gets or sets the identity of the show being packaged.</summary>
    public string ShowId { get; set; } = string.Empty;
    public bool Render { get; set; } = true;
}

/// <summary>
/// Packages the show: derives scene windows from the timing, writes the engine spec, the lyrics
/// and the audio analysis, and zips it all - appending <see cref="ShowPackaged"/>.
/// </summary>
public class ShowPackagingJob : Job<ShowPackagingRequest, JobState>, IShowPackagingJob
{
    /// <inheritdoc/>
    protected override Task<IImmutableList<JobStepDetails>> PrepareSteps(ShowPackagingRequest request) =>
        Task.FromResult<IImmutableList<JobStepDetails>>(ImmutableList.Create(CreateStep<IPackageShowStep>(request)));

    /// <inheritdoc/>
    protected override JobDetails GetJobDetails() => "Package the show";
}

/// <summary>
/// Produces and records the package for one show.
/// </summary>
/// <param name="state"><see cref="IPersistentState{TState}"/> for the step's own bookkeeping.</param>
/// <param name="throttle">The <see cref="IJobStepThrottle"/> limiting parallel execution.</param>
/// <param name="logger">The logger.</param>
/// <param name="scopeFactory">The scope services are resolved from - a step runs outside any request.</param>
/// <param name="chronicleClient">The <see cref="IChronicleClient"/> the package is appended through.</param>
public class PackageShowStep(
    [PersistentState(nameof(PackageShowStepState), WellKnownGrainStorageProviders.JobSteps)] IPersistentState<PackageShowStepState> state,
    IJobStepThrottle throttle,
    ILogger<PackageShowStep> logger,
    IServiceScopeFactory scopeFactory,
    IChronicleClient chronicleClient)
    : JobStep<ShowPackagingRequest, object, PackageShowStepState>(state, throttle, logger), IPackageShowStep
{
    /// <inheritdoc/>
    protected override Task<Result<PrepareJobStepError>> PrepareStep(ShowPackagingRequest request) =>
        Task.FromResult(Result<PrepareJobStepError>.Success());

    /// <inheritdoc/>
    protected override ValueTask InitializeState(ShowPackagingRequest request)
    {
        State.ShowId = request.ShowId;
        State.Render = request.Render;
        return ValueTask.CompletedTask;
    }

    /// <inheritdoc/>
    protected override async Task<Catch<JobStepResult>> PerformStep(PackageShowStepState currentState, CancellationToken cancellationToken)
    {
        var showId = ShowId.From(Guid.Parse(currentState.ShowId));
        try
        {
        await using var scope = scopeFactory.CreateAsyncScope();
        var services = scope.ServiceProvider;
        var packager = services.GetRequiredService<IShowPackager>();
        var artifactStore = services.GetRequiredService<ShowArtifactStore>();
        var stills = services.GetRequiredService<Motion.Shows.Rendering.IEngineStills>();
        var logger = services.GetRequiredService<ILogger<PackageShowStep>>();

        if (ShowArtifactStore.ReadTextOrNull(artifactStore.LyricsJson(showId)) is null)
        {
            throw new SpeechTranscriptionFailed("The show has no timing yet - time it first.");
        }
        var planJson = ShowArtifactStore.ReadTextOrNull(artifactStore.PlanJson(showId))
            ?? throw new ShowPlanningFailed("The show has no plan - plan it first.");
        var plan = ShowPlanner.Deserialize(planJson) ?? throw new ShowPlanningFailed("The stored plan could not be read.");
        var lyricsJson = ShowArtifactStore.ReadTextOrNull(artifactStore.LyricsJson(showId))
            ?? throw new SpeechTranscriptionFailed("The show has no timing - time it first.");
        var audioAnalysisJson = ShowArtifactStore.ReadTextOrNull(artifactStore.AudioAnalysisJson(showId)) ?? "{}";

        var voiceoverWav = artifactStore.VoiceoverWav(showId);
        if (!File.Exists(voiceoverWav)) throw new SpeechSynthesisFailed("The voiceover is missing - synthesize it first.");
        var audioDuration = Wav.ReadDuration(voiceoverWav);

        // pick the packaged audio: mp3 when it exists, wav otherwise
        var mp3 = artifactStore.VoiceoverAudio(showId);
        var voiceoverSource = File.Exists(mp3) ? mp3 : voiceoverWav;

        var windows = ShowSpecWriter.DeriveWindows(plan, lyricsJson, audioDuration);
        var spec = ShowSpecWriter.Build(showId.Value, plan, windows, audioDuration);
        var specJson = ShowSpecWriter.Serialize(spec);

        var packageDirectory = packager.WritePackageDirectory(showId, plan.Title, specJson, lyricsJson, audioAnalysisJson, voiceoverSource);
        var packageZip = artifactStore.PackageZip(showId);
        packager.Zip(packageDirectory, packageZip);

        // storyboard thumbnails: one still per scene at its midpoint (best effort - a failed
        // capture leaves the editor on placeholders, it never fails the show)
        try
        {
            var times = windows.Select(w => Math.Round((w.Start + w.End) / 2, 2)).ToList();
            await stills.CapturePerScene(packageDirectory, times, artifactStore.SnapshotsFolderFor(showId), cancellationToken);
        }
        catch (Exception snapshotEx)
        {
            logger.LogWarning(snapshotEx, "Scene stills failed for {ShowId} - the storyboard falls back to placeholders", showId.Value);
        }

        await JobStepAppender.Append(this, chronicleClient, showId.Value, new ShowPackaged(packageDirectory, packageZip, currentState.Render));
        return JobStepResult.Succeeded();
        }
        catch (Exception exception)
        {
            var message = await JobStepAppender.ReportFailure(this, chronicleClient, showId.Value, "package", exception, logger);
            return JobStepResult.Failed(message);
        }
    }

    /// <inheritdoc/>
    protected override ValueTask<object?> CreateCancelledResultFromCurrentState(PackageShowStepState currentState) =>
        ValueTask.FromResult<object?>(null);
}
