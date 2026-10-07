// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Observation;
using Motion.Jobs;
using Motion.Shows.Voiceover;

namespace Motion.Shows.Storyboard;

/// <summary>
/// Starts production when a storyboard is saved: the plan is already on disk, so the voiceover
/// job picks it up and everything downstream follows - timing, package, render.
/// </summary>
/// <param name="jobs">Where the production is handed to.</param>
public sealed class StoryboardProducer(IJobsManagerAccessor jobs) : IReactor
{
    /// <summary>
    /// Produces the show from its saved storyboard. <c>[OnceOnly]</c> guards the job from being
    /// started again when Chronicle replays this observer.
    /// </summary>
    /// <param name="event">The save.</param>
    /// <param name="context">The event context.</param>
    /// <returns>Awaitable task.</returns>
    [OnceOnly]
    public Task On(ShowStoryboardSaved @event, EventContext context) =>
        jobs.For(context).Start<IVoiceoverSynthesisJob, VoiceoverSynthesisRequest>(new(
            context.EventSourceId.Value.ToString()));
}
