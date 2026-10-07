// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Observation;
using MongoDB.Driver;
using Motion.AI;
using Motion.Shows.Creation;
using Motion.Shows.Listing;
using Motion.Shows.Production;

namespace Motion.Shows.Planning;

/// <summary>
/// Plans a show when it is created or when the user asks for a re-plan: asks the language model
/// for the story, validates it against the engine's scene catalog, and returns the plan —
/// stored on disk, recorded in the event.
/// </summary>
/// <remarks>
/// A reactor is the right home for this: Chronicle persists the observation offset, so a show
/// mid-planning resumes after a restart.
/// </remarks>
/// <param name="languageModel">The language model.</param>
/// <param name="artifactStore">The artifact store.</param>
/// <param name="shows">The show listing collection (for re-plans, where the original request lives in the read model).</param>
/// <param name="stages">The stage executor (planning can take minutes; the reactor acks immediately).</param>
public sealed class ShowPlannerReactor(
    ILanguageModel languageModel,
    ShowArtifactStore artifactStore,
    IMongoCollection<Show> shows,
    PipelineStageExecutor stages) : IReactor
{
    /// <summary>
    /// Plans the show when it is created.
    /// </summary>
    /// <param name="event">The creation event with the description.</param>
    /// <param name="context">The event context.</param>
    /// <returns>The planning completion.</returns>
    public Task On(ShowCreated @event, EventContext context)
    {
        stages.Begin(context, "planning", async () =>
        {
            var showId = ShowId.From(context.EventSourceId);

            // A stored plan is the source of truth — seeded demos arrive with their plan already
            // on disk, and a crashed planning stage must not re-ask the model on redelivery.
            // Re-planning is an explicit request (ShowPlanningRequested), never automatic.
            var existing = ShowArtifactStore.ReadTextOrNull(artifactStore.PlanJson(showId));
            if (existing is not null)
            {
                var stored = ShowPlanner.Deserialize(existing) ?? throw new ShowPlanningFailed("The stored plan could not be read.");
                return new ShowPlanned(stored.Title, existing);
            }

            var plan = await Plan(context.EventSourceId, @event.Description, @event.TargetDurationSeconds, @event.Tone, @event.Audience);
            return new ShowPlanned(plan.Title, ShowPlanner.Serialize(plan));
        });
        return Task.CompletedTask;
    }

    /// <summary>
    /// Plans the show when a re-plan is requested — the description comes from the read model.
    /// </summary>
    /// <param name="event">The request.</param>
    /// <param name="context">The event context.</param>
    /// <returns>The planning completion.</returns>
    public Task On(ShowPlanningRequested @event, EventContext context)
    {
        stages.Begin(context, "planning", async () =>
        {
            var show = await shows.Find(s => s.Id == ShowId.From(context.EventSourceId)).FirstOrDefaultAsync()
                ?? throw new ShowPlanningFailed("The show could not be found for re-planning.");
            var plan = await Plan(context.EventSourceId, show.Description, show.TargetDurationSeconds, show.Tone, show.Audience);
            return new ShowPlanned(plan.Title, ShowPlanner.Serialize(plan));
        });
        return Task.CompletedTask;
    }

    async Task<ShowPlan> Plan(EventSourceId eventSourceId, string description, double targetDuration, string tone, string audience)
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
        ShowArtifactStore.WriteText(artifactStore.PlanJson(ShowId.From(eventSourceId)), ShowPlanner.Serialize(plan));
        return plan;
    }
}
