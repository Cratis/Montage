// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Observation;
using MongoDB.Driver;
using Motion.Jobs;
using Motion.Shows.Creation;
using Motion.Shows.Listing;

namespace Motion.Shows.Planning;

/// <summary>
/// Starts a durable planning job when a show is created or a re-plan is asked for. The job - not
/// the reactor - asks the language model for the story and appends <see cref="ShowPlanned"/> when
/// it lands.
/// </summary>
/// <param name="jobs">Where the planning is handed to.</param>
/// <param name="shows">The show listing collection (a re-plan reads the original ask from the read model).</param>
public sealed class ShowPlannerReactor(
    IJobsManagerAccessor jobs,
    IMongoCollection<Show> shows) : IReactor
{
    /// <summary>
    /// Plans the show when it is created. <c>[OnceOnly]</c> guards the job from being started again
    /// when Chronicle replays this observer.
    /// </summary>
    /// <param name="event">The creation event with the description.</param>
    /// <param name="context">The event context.</param>
    /// <returns>Awaitable task.</returns>
    [OnceOnly]
    public Task On(ShowCreated @event, EventContext context) =>
        @event.PlanManually
            ? Task.CompletedTask
            : jobs.For(context).Start<IShowPlanningJob, ShowPlanningRequest>(new(
                ShowId.From(context.EventSourceId).Value.ToString(),
                @event.Description,
                @event.TargetDurationSeconds,
                @event.Tone,
                @event.Audience,
                @event.AIProviderId));

    /// <summary>
    /// Plans the show when a re-plan is requested - the description and provider come from the read
    /// model. A show that cannot be found is logged and skipped rather than failed: a poisoned
    /// partition is worse than a missing re-plan.
    /// </summary>
    /// <param name="event">The request.</param>
    /// <param name="context">The event context.</param>
    /// <returns>Awaitable task.</returns>
    [OnceOnly]
    public async Task On(ShowPlanningRequested @event, EventContext context)
    {
        var show = await shows.Find(s => s.Id == ShowId.From(context.EventSourceId)).FirstOrDefaultAsync();
        if (show is null)
        {
            return;
        }

        await jobs.For(context).Start<IShowPlanningJob, ShowPlanningRequest>(new(
            show.Id.Value.ToString(),
            show.Description,
            show.TargetDurationSeconds,
            show.Tone,
            show.Audience,
            show.AIProviderId));
    }
}
