// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Observation;
using Montage.Jobs;
using Montage.Shows.Planning;

namespace Montage.Shows.Voiceover;

/// <summary>
/// Starts a durable voiceover job when a plan has been made or a re-synthesis is asked for. The
/// job - not the reactor - synthesizes each scene's narration and appends
/// <see cref="VoiceoverSynthesized"/> when it lands.
/// </summary>
/// <param name="jobs">Where the synthesis is handed to.</param>
public sealed class VoiceoverSynthesisReactor(IJobsManagerAccessor jobs) : IReactor
{
    /// <summary>
    /// Speaks the show when a plan has been made. <c>[OnceOnly]</c> guards the job from being
    /// started again when Chronicle replays this observer.
    /// </summary>
    /// <param name="event">The plan.</param>
    /// <param name="context">The event context.</param>
    /// <returns>Awaitable task.</returns>
    [OnceOnly]
    public Task On(ShowPlanned @event, EventContext context) =>
        jobs.For(context).Start<IVoiceoverSynthesisJob, VoiceoverSynthesisRequest>(new(
            ShowId.From(context.EventSourceId).Value.ToString(), Render: true));

    /// <summary>
    /// Re-synthesizes when the user asks for it - the plan comes from disk.
    /// </summary>
    /// <param name="event">The request.</param>
    /// <param name="context">The event context.</param>
    /// <returns>Awaitable task.</returns>
    [OnceOnly]
    public Task On(VoiceoverSynthesisRequested @event, EventContext context) =>
        jobs.For(context).Start<IVoiceoverSynthesisJob, VoiceoverSynthesisRequest>(new(
            ShowId.From(context.EventSourceId).Value.ToString(), Render: true));
}
