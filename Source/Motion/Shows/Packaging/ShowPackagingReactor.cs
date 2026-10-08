// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Observation;
using Motion.Jobs;
using Motion.Shows.Timing;

namespace Motion.Shows.Packaging;

/// <summary>
/// Starts a durable packaging job when the timing has landed or a re-package is asked for. The
/// job - not the reactor - writes the engine package and appends <see cref="ShowPackaged"/>.
/// </summary>
/// <param name="jobs">Where the packaging is handed to.</param>
public sealed class ShowPackagingReactor(IJobsManagerAccessor jobs) : IReactor
{
    /// <summary>
    /// Packages the show when the timing has landed. <c>[OnceOnly]</c> guards the job from being
    /// started again when Chronicle replays this observer.
    /// </summary>
    /// <param name="event">The timing completion.</param>
    /// <param name="context">The event context.</param>
    /// <returns>Awaitable task.</returns>
    [OnceOnly]
    public Task On(ShowTimed @event, EventContext context) =>
        jobs.For(context).Start<IShowPackagingJob, ShowPackagingRequest>(new(
            ShowId.From(context.EventSourceId).Value.ToString(),
            @event.Render));

    /// <summary>
    /// Re-packages when the user asks for it.
    /// </summary>
    /// <param name="event">The request.</param>
    /// <param name="context">The event context.</param>
    /// <returns>Awaitable task.</returns>
    [OnceOnly]
    public Task On(ShowPackagingRequested @event, EventContext context) =>
        jobs.For(context).Start<IShowPackagingJob, ShowPackagingRequest>(new(
            ShowId.From(context.EventSourceId).Value.ToString(),
            Render: true));
}
