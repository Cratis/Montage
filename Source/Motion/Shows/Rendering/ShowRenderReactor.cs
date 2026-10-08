// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Observation;
using Motion.Jobs;
using Motion.Shows.Packaging;

namespace Motion.Shows.Rendering;

/// <summary>
/// Starts a durable render job when the package has landed or a re-render is asked for. The job -
/// not the reactor - runs the engine and appends <see cref="RenderCompleted"/>.
/// </summary>
/// <param name="jobs">Where the rendering is handed to.</param>
public sealed class ShowRenderReactor(IJobsManagerAccessor jobs) : IReactor
{
    /// <summary>
    /// Renders the show when the package has landed. <c>[OnceOnly]</c> guards the job from being
    /// started again when Chronicle replays this observer.
    /// </summary>
    /// <param name="event">The packaging completion.</param>
    /// <param name="context">The event context.</param>
    /// <returns>Awaitable task.</returns>
    [OnceOnly]
    public Task On(ShowPackaged @event, EventContext context)
    {
        // packaging without render: the show is workable (voice, timing, stills, preview)
        // but the user has not asked for the mp4 yet
        if (!@event.Render) return Task.CompletedTask;
        return jobs.For(context).Start<IShowRenderJob, ShowRenderRequest>(new(
            ShowId.From(context.EventSourceId).Value.ToString(),
            @event.PackageDirectory));
    }

    /// <summary>
    /// Re-renders when the user asks for it - the package directory comes from the workspace.
    /// </summary>
    /// <param name="event">The request.</param>
    /// <param name="context">The event context.</param>
    /// <returns>Awaitable task.</returns>
    [OnceOnly]
    public Task On(RenderRequested @event, EventContext context) =>
        jobs.For(context).Start<IShowRenderJob, ShowRenderRequest>(new(
            ShowId.From(context.EventSourceId).Value.ToString(),
            string.Empty));
}
