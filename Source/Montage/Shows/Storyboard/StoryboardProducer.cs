// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Observation;
using Montage.Jobs;
using Montage.Shows.Voiceover;

namespace Montage.Shows.Storyboard;

/// <summary>
/// Starts production when a storyboard is saved: the plan is already on disk, so the voiceover
/// job picks it up and everything downstream follows - timing, package, render.
/// </summary>
/// <param name="jobs">Where the production is handed to.</param>
public sealed class StoryboardProducer(IJobsManagerAccessor jobs) : IReactor
{
    /// <summary>
    /// Puts a saved storyboard to work immediately: the voice is (re-)recorded, the words are
    /// (re-)timed and the package (stills, preview data) is refreshed - so the timing is there
    /// to work with the moment narration changes. The mp4 renders only when the save asked
    /// for it. <c>[OnceOnly]</c> guards the job from being started again on replay.
    /// </summary>
    /// <param name="event">The save.</param>
    /// <param name="context">The event context.</param>
    /// <returns>Awaitable task.</returns>
    [OnceOnly]
    public Task On(ShowStoryboardSaved @event, EventContext context) =>
        jobs.For(context).Start<IVoiceoverSynthesisJob, VoiceoverSynthesisRequest>(new(
            context.EventSourceId.Value,
            @event.Render));
}
