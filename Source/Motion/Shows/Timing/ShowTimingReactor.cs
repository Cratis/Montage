// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Observation;
using Motion.Jobs;
using Motion.Shows.Voiceover;

namespace Motion.Shows.Timing;

/// <summary>
/// Starts a durable timing job when the voiceover has landed or a re-time is asked for. The job -
/// not the reactor - aligns the words to the audio and appends <see cref="ShowTimed"/>.
/// </summary>
/// <param name="jobs">Where the timing is handed to.</param>
public sealed class ShowTimingReactor(IJobsManagerAccessor jobs) : IReactor
{
    /// <summary>
    /// Times the show when the voiceover has been synthesized. <c>[OnceOnly]</c> guards the job
    /// from being started again when Chronicle replays this observer.
    /// </summary>
    /// <param name="event">The voiceover completion.</param>
    /// <param name="context">The event context.</param>
    /// <returns>Awaitable task.</returns>
    [OnceOnly]
    public Task On(VoiceoverSynthesized @event, EventContext context) =>
        jobs.For(context).Start<IShowTimingJob, ShowTimingRequest>(new(
            ShowId.From(context.EventSourceId).Value.ToString(),
            @event.DurationSeconds));

    /// <summary>
    /// Re-times when the user asks for it - the duration is read from the voiceover WAV.
    /// </summary>
    /// <param name="event">The request.</param>
    /// <param name="context">The event context.</param>
    /// <returns>Awaitable task.</returns>
    [OnceOnly]
    public Task On(ShowTimingRequested @event, EventContext context) =>
        jobs.For(context).Start<IShowTimingJob, ShowTimingRequest>(new(
            ShowId.From(context.EventSourceId).Value.ToString(),
            0));
}
