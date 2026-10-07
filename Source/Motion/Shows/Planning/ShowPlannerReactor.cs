// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.EventSequences;
using Cratis.Chronicle.Observation;
using MongoDB.Driver;
using Motion.AI;
using Motion.Shows.Creation;
using Motion.Shows.Listing;
using Motion.Shows.Production;

namespace Motion.Shows.Planning;

/// <summary>
/// Plans a show when it is created or when the user asks for a re-plan: asks the language model
/// for the story, validates it against the engine's scene catalog, and stores the plan on disk
/// and in the event log.
/// </summary>
/// <remarks>
/// A reactor is the right home for this: Chronicle persists the observation offset, so a show
/// mid-planning resumes after a restart.
/// </remarks>
/// <param name="languageModel">The language model.</param>
/// <param name="eventLog">The event log to append the plan to.</param>
/// <param name="artifactStore">The artifact store.</param>
/// <param name="shows">The show listing collection (for re-plans, where the original request lives in the read model).</param>
/// <param name="logger">The logger.</param>
public sealed class ShowPlannerReactor(
    ILanguageModel languageModel,
    IEventLog eventLog,
    ShowArtifactStore artifactStore,
    IMongoCollection<Show> shows,
    ILogger<ShowPlannerReactor> logger) : IReactor
{
    /// <summary>
    /// Plans the show when it is created.
    /// </summary>
    /// <param name="event">The creation event with the description.</param>
    /// <param name="context">The event context.</param>
    /// <returns>A completed task.</returns>
    public Task On(ShowCreated @event, EventContext context) =>
        PipelineStage.Run(eventLog, context, "planning", () =>
            Plan(context.EventSourceId, @event.Description, @event.TargetDurationSeconds, @event.Tone, @event.Audience));

    /// <summary>
    /// Plans the show when a re-plan is requested — the description comes from the read model.
    /// </summary>
    /// <param name="event">The request.</param>
    /// <param name="context">The event context.</param>
    /// <returns>A completed task.</returns>
    public Task On(ShowPlanningRequested @event, EventContext context) =>
        PipelineStage.Run(eventLog, context, "planning", async () =>
        {
            var show = await shows.Find(s => s.Id == ShowId.From(context.EventSourceId)).FirstOrDefaultAsync();
            if (show is null) throw new ShowPlanningFailed("The show could not be found for re-planning.");
            await Plan(context.EventSourceId, show.Description, show.TargetDurationSeconds, show.Tone, show.Audience);
        });

    async Task Plan(EventSourceId eventSourceId, string description, double targetDuration, string tone, string audience)
    {
        if (!languageModel.IsEnabled)
        {
            throw new AiNotConfigured(
                "No language model is configured. Set Cratis:Motion:Ai in appsettings.local.json " +
                "(an OpenAI-compatible endpoint such as Ollama or LM Studio, or Anthropic).");
        }
        var (system, user) = ShowPlanner.BuildPrompt(description, targetDuration, tone, audience);
        var answer = await languageModel.Complete(system, user, CancellationToken.None);
        var plan = ShowPlanner.Parse(answer);
        var planJson = ShowPlanner.Serialize(plan);
        ShowArtifactStore.WriteText(artifactStore.PlanJson(ShowId.From(eventSourceId)), planJson);
        await eventLog.Append(eventSourceId, new ShowPlanned(plan.Title, planJson));
    }
}
