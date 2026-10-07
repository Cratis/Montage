// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle;
using Cratis.Chronicle.EventSequences;
using Cratis.Orleans.Jobs;
using Orleans.Runtime;

namespace Motion.Jobs;

/// <summary>
/// Appends a stage's completion event through the event store and namespace the job itself is
/// keyed by - a step runs outside any request, so there is no scoped event log to resolve.
/// </summary>
public static class JobStepAppender
{
    /// <summary>
    /// Appends an event to the event log the calling step's job belongs to.
    /// </summary>
    /// <param name="grain">The step grain (its primary key carries scope and namespace).</param>
    /// <param name="chronicleClient">The <see cref="IChronicleClient"/> to append through.</param>
    /// <param name="eventSourceId">The event source - always the show the job works on.</param>
    /// <param name="event">The completion event.</param>
    public static async Task Append(IAddressable grain, IChronicleClient chronicleClient, EventSourceId eventSourceId, object @event)
    {
        _ = grain.GetPrimaryKey(out var key);
        var jobStepKey = (JobStepKey)key!;
        var eventStore = await chronicleClient.GetEventStore(jobStepKey.Scope, jobStepKey.Namespace);
        await eventStore.EventLog.Append(eventSourceId, @event);
    }
}
