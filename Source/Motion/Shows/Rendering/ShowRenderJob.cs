// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Collections.Immutable;
using Cratis.Chronicle;
using Cratis.Monads;
using Cratis.Orleans;
using Cratis.Orleans.Jobs;
using Cratis.Orleans.Storage.Jobs;
using Motion.Jobs;
using Motion.Speech;
using Orleans.Runtime;

namespace Motion.Shows.Rendering;

/// <summary>
/// Defines the grain for <see cref="ShowRenderJob"/>.
/// </summary>
public interface IShowRenderJob : IJob<ShowRenderRequest>;

/// <summary>
/// Defines the grain for <see cref="RenderShowStep"/>.
/// </summary>
public interface IRenderShowStep : IJobStep<ShowRenderRequest, object, RenderShowStepState>, IJobObserver;

/// <summary>
/// What <see cref="ShowRenderJob"/> was asked to do - render one show's package to video. An
/// empty package directory means read it from the show's workspace (an explicit re-render).
/// </summary>
public record ShowRenderRequest(string ShowId, string PackageDirectory) : IJobRequest;

/// <summary>
/// The persisted state for <see cref="RenderShowStep"/>.
/// </summary>
public class RenderShowStepState : JobStepState
{
    /// <summary>Gets or sets the identity of the show being rendered.</summary>
    public string ShowId { get; set; } = string.Empty;

    /// <summary>Gets or sets the package directory to render - empty to read from the workspace.</summary>
    public string PackageDirectory { get; set; } = string.Empty;
}

/// <summary>
/// Renders the show's package to an MP4 with the engine and appends <see cref="RenderCompleted"/>.
/// </summary>
public class ShowRenderJob : Job<ShowRenderRequest, JobState>, IShowRenderJob
{
    /// <inheritdoc/>
    protected override Task<IImmutableList<JobStepDetails>> PrepareSteps(ShowRenderRequest request) =>
        Task.FromResult<IImmutableList<JobStepDetails>>(ImmutableList.Create(CreateStep<IRenderShowStep>(request)));

    /// <inheritdoc/>
    protected override JobDetails GetJobDetails() => "Render the video";
}

/// <summary>
/// Renders and records the video for one show.
/// </summary>
/// <param name="state"><see cref="IPersistentState{TState}"/> for the step's own bookkeeping.</param>
/// <param name="throttle">The <see cref="IJobStepThrottle"/> limiting parallel execution.</param>
/// <param name="logger">The logger.</param>
/// <param name="scopeFactory">The scope services are resolved from - a step runs outside any request.</param>
/// <param name="chronicleClient">The <see cref="IChronicleClient"/> the render is appended through.</param>
public class RenderShowStep(
    [PersistentState(nameof(RenderShowStepState), WellKnownGrainStorageProviders.JobSteps)] IPersistentState<RenderShowStepState> state,
    IJobStepThrottle throttle,
    ILogger<RenderShowStep> logger,
    IServiceScopeFactory scopeFactory,
    IChronicleClient chronicleClient)
    : JobStep<ShowRenderRequest, object, RenderShowStepState>(state, throttle, logger), IRenderShowStep
{
    /// <inheritdoc/>
    protected override Task<Result<PrepareJobStepError>> PrepareStep(ShowRenderRequest request) =>
        Task.FromResult(Result<PrepareJobStepError>.Success());

    /// <inheritdoc/>
    protected override ValueTask InitializeState(ShowRenderRequest request)
    {
        State.ShowId = request.ShowId;
        State.PackageDirectory = request.PackageDirectory;
        return ValueTask.CompletedTask;
    }

    /// <inheritdoc/>
    protected override async Task<Catch<JobStepResult>> PerformStep(RenderShowStepState currentState, CancellationToken cancellationToken)
    {
        var showId = ShowId.From(Guid.Parse(currentState.ShowId));

        await using var scope = scopeFactory.CreateAsyncScope();
        var services = scope.ServiceProvider;
        var renderer = services.GetRequiredService<IVideoRenderer>();
        var artifactStore = services.GetRequiredService<ShowArtifactStore>();

        var packageDirectory = currentState.PackageDirectory;
        if (packageDirectory.Length == 0) packageDirectory = artifactStore.PackageDirectory(showId);
        if (!Directory.Exists(packageDirectory))
        {
            throw new RenderFailed("The show has no package - package it first.");
        }

        var videoPath = await renderer.Render(showId, packageDirectory, cancellationToken);
        var duration = 0.0;
        try
        {
            duration = Wav.ReadDuration(artifactStore.VoiceoverWav(showId));
        }
        catch
        {
            // duration is informational; the file is what matters
        }
        var size = File.Exists(videoPath) ? new FileInfo(videoPath).Length : 0;
        var relativePath = Path.GetRelativePath(artifactStore.FolderFor(showId), videoPath);

        await JobStepAppender.Append(this, chronicleClient, showId.Value, new RenderCompleted(relativePath, duration, size));
        return JobStepResult.Succeeded();
    }

    /// <inheritdoc/>
    protected override ValueTask<object?> CreateCancelledResultFromCurrentState(RenderShowStepState currentState) =>
        ValueTask.FromResult<object?>(null);
}
