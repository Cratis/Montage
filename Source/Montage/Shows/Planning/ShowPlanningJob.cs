// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Collections.Immutable;
using Cratis.AI.Conversations;
using Cratis.AI.Providers;
using Cratis.Chronicle;
using Cratis.Chronicle.ReadModels;
using Cratis.Monads;
using Cratis.Orleans;
using Cratis.Orleans.Jobs;
using Cratis.Orleans.Storage.Jobs;
using Microsoft.Extensions.AI;
using MongoDB.Driver;
using Montage.AI;
using Montage.Jobs;
using Montage.Shows.Production;
using Orleans.Runtime;

namespace Montage.Shows.Planning;

/// <summary>
/// Defines the grain for <see cref="ShowPlanningJob"/>.
/// </summary>
public interface IShowPlanningJob : IJob<ShowPlanningRequest>;

/// <summary>
/// Defines the grain for <see cref="PlanShowStep"/>.
/// </summary>
public interface IPlanShowStep : IJobStep<ShowPlanningRequest, object, PlanShowStepState>, IJobObserver;

/// <summary>
/// What <see cref="ShowPlanningJob"/> was asked to do - everything the story needs, plus the AI
/// provider the show was created with.
/// </summary>
/// <remarks>
/// Primitives rather than the concept types they stand for - a person reading the job's persisted
/// request should not need to know the shape of a concept to see what was asked for.
/// </remarks>
public record ShowPlanningRequest(
    string ShowId,
    string Description,
    double TargetDurationSeconds,
    string Tone,
    string Audience,
    string AIProviderId) : IJobRequest;

/// <summary>
/// The persisted state for <see cref="PlanShowStep"/> - the whole ask, carried here (rather than a
/// plain field) so it survives a restart between the step being prepared and it actually running.
/// </summary>
public class PlanShowStepState : JobStepState
{
    /// <summary>Gets or sets the identity of the show being planned.</summary>
    public string ShowId { get; set; } = string.Empty;

    /// <summary>Gets or sets what the show should be about.</summary>
    public string Description { get; set; } = string.Empty;

    /// <summary>Gets or sets the target duration in seconds.</summary>
    public double TargetDurationSeconds { get; set; }

    /// <summary>Gets or sets the tone to speak with.</summary>
    public string Tone { get; set; } = string.Empty;

    /// <summary>Gets or sets the audience to speak to.</summary>
    public string Audience { get; set; } = string.Empty;

    /// <summary>Gets or sets the identity of the AI provider the show was created with.</summary>
    public string AIProviderId { get; set; } = string.Empty;
}

/// <summary>
/// Plans a show: asks the AI provider the show was created with for the story, validates it
/// against the engine's scene catalog, and appends <see cref="ShowPlanned"/>.
/// </summary>
/// <remarks>
/// A stored plan is the source of truth - seeded demos arrive with their plan already on disk,
/// and a crashed planning job must not re-ask the model on resume. Only when there is no stored
/// plan does the step call the provider.
/// </remarks>
public class ShowPlanningJob : Job<ShowPlanningRequest, JobState>, IShowPlanningJob
{
    /// <inheritdoc/>
    protected override Task<IImmutableList<JobStepDetails>> PrepareSteps(ShowPlanningRequest request) =>
        Task.FromResult<IImmutableList<JobStepDetails>>(ImmutableList.Create(CreateStep<IPlanShowStep>(request)));

    /// <inheritdoc/>
    protected override JobDetails GetJobDetails() => "Plan the show";
}

/// <summary>
/// Produces and records the plan for one show.
/// </summary>
/// <param name="state"><see cref="IPersistentState{TState}"/> for the step's own bookkeeping.</param>
/// <param name="throttle">The <see cref="IJobStepThrottle"/> limiting parallel execution.</param>
/// <param name="logger">The logger.</param>
/// <param name="scopeFactory">The scope services are resolved from - a step runs outside any request.</param>
/// <param name="chronicleClient">The <see cref="IChronicleClient"/> the plan is appended through.</param>
public partial class PlanShowStep(
    [PersistentState(nameof(PlanShowStepState), WellKnownGrainStorageProviders.JobSteps)] IPersistentState<PlanShowStepState> state,
    IJobStepThrottle throttle,
    ILogger<PlanShowStep> logger,
    IServiceScopeFactory scopeFactory,
    IChronicleClient chronicleClient)
    : JobStep<ShowPlanningRequest, object, PlanShowStepState>(state, throttle, logger), IPlanShowStep
{
    /// <inheritdoc/>
    protected override Task<Result<PrepareJobStepError>> PrepareStep(ShowPlanningRequest request) =>
        Task.FromResult(Result<PrepareJobStepError>.Success());

    /// <inheritdoc/>
    protected override ValueTask InitializeState(ShowPlanningRequest request)
    {
        State.ShowId = request.ShowId;
        State.Description = request.Description;
        State.TargetDurationSeconds = request.TargetDurationSeconds;
        State.Tone = request.Tone;
        State.Audience = request.Audience;
        State.AIProviderId = request.AIProviderId;
        return ValueTask.CompletedTask;
    }

    /// <inheritdoc/>
    protected override async Task<Catch<JobStepResult>> PerformStep(PlanShowStepState currentState, CancellationToken cancellationToken)
    {
        var showId = ShowId.From(Guid.Parse(currentState.ShowId));

        await using var scope = scopeFactory.CreateAsyncScope();
        var services = scope.ServiceProvider;
        var artifactStore = services.GetRequiredService<ShowArtifactStore>();

        // A stored plan is the source of truth - seeded demos arrive with their plan already on
        // disk, and a crashed planning job must not re-ask the model on resume. Re-planning is an
        // explicit request (ShowPlanningRequested), never automatic.
        // A model call that never returns must become a failed job, not an eternal "running":
        // five minutes is generous for resolve + one planning completion + the append.
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromMinutes(5));

        try
        {
            var planJson = ShowArtifactStore.ReadTextOrNull(artifactStore.PlanJson(showId));
            if (planJson is null)
            {
                planJson = await AskTheModel(currentState, services, timeout.Token);
                ShowArtifactStore.WriteText(artifactStore.PlanJson(showId), planJson);
            }

            var stored = ShowPlanner.Deserialize(planJson) ?? throw new ShowPlanningFailed("The stored plan could not be read.");
            await JobStepAppender.Append(this, chronicleClient, showId.Value, new ShowPlanned(stored.Title, planJson));
            return JobStepResult.Succeeded();
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            const string Message = "Planning did not finish within five minutes - the model or the provider did not answer. Check the provider under settings and try again.";
            await JobStepAppender.ReportFailure(this, chronicleClient, showId.Value, "plan", new ShowPlanningFailed(Message), logger);
            return JobStepResult.Failed(Message);
        }
        catch (Exception exception)
        {
            var message = await JobStepAppender.ReportFailure(this, chronicleClient, showId.Value, "plan", exception, logger);
            return JobStepResult.Failed(message);
        }
    }

    /// <inheritdoc/>
    protected override ValueTask<object?> CreateCancelledResultFromCurrentState(PlanShowStepState currentState) =>
        ValueTask.FromResult<object?>(null);

    async Task<string> AskTheModel(PlanShowStepState currentState, IServiceProvider services, CancellationToken cancellationToken)
    {
        if (currentState.AIProviderId.Length == 0)
        {
            throw new AiNotConfigured(
                "No AI provider was chosen for this show. Pick one in the generate dialog, or add one under settings.");
        }

        LogResolvingProvider(logger, currentState.ShowId, currentState.AIProviderId);
        var readModels = services.GetRequiredService<IReadModels>();
        var provider = (await readModels.GetInstanceById<ConfiguredAIProvider>((EventSourceId)currentState.AIProviderId).WaitAsync(cancellationToken))
            ?? throw new AiNotConfigured($"The AI provider this show was created with ({currentState.AIProviderId}) no longer exists. Pick another under settings.");

        var (system, user) = ShowPlanner.BuildPrompt(currentState.Description, currentState.TargetDurationSeconds, currentState.Tone, currentState.Audience);

        // The provider itself rarely names a model - resolve the vendor's default explicitly and
        // carry it on the options too: the Anthropic client ignores the client-level default.
        var modelId = AIChatClientFactory.ResolveModelId(provider.Type, provider.Model);
        var resolved = AIChatClientFactory.Create(provider.Type, provider.ApiKey, provider.Endpoint, modelId)
            ?? throw new AiNotConfigured("The chosen AI provider could not be reached for chat completions.");
        LogAskingModel(logger, currentState.ShowId, resolved.ModelId, provider.ApiKey?.Value?.Length ?? 0);
        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        var response = await resolved.Client.GetResponseAsync(
            [new(ChatRole.System, system), new(ChatRole.User, user)],
            new ChatOptions { ModelId = resolved.ModelId },
            cancellationToken: cancellationToken);
        stopwatch.Stop();
        LogModelAnswered(logger, currentState.ShowId, stopwatch.Elapsed.TotalSeconds.ToString("F1"), response.Text?.Length ?? 0);
        var answer = response.Text ?? string.Empty;
        var plan = ShowPlanner.Parse(answer);
        return ShowPlanner.Serialize(plan);
    }

    [LoggerMessage(0, LogLevel.Information, "Planning show {ShowId}: resolving provider {ProviderId}")]
    static partial void LogResolvingProvider(ILogger logger, string showId, string providerId);

    [LoggerMessage(1, LogLevel.Information, "Planning show {ShowId}: asking {Model} ({KeyLength} chars of key)")]
    static partial void LogAskingModel(ILogger logger, string showId, string model, int keyLength);

    [LoggerMessage(2, LogLevel.Information, "Planning show {ShowId}: model answered in {Seconds}s with {Length} chars")]
    static partial void LogModelAnswered(ILogger logger, string showId, string seconds, int length);
}
