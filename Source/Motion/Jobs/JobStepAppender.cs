// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle;
using Cratis.Chronicle.EventSequences;
using Cratis.Orleans.Jobs;
using Microsoft.Extensions.Logging;
using Motion.Shows.Production;
using Orleans.Runtime;

namespace Motion.Jobs;

/// <summary>
/// Appends a stage's completion event through the event store and namespace the job itself is
/// keyed by - a step runs outside any request, so there is no scoped event log to resolve.
/// </summary>
public static partial class JobStepAppender
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

        // A call that lands on a stale connection and has no deadline will hang forever; two
        // minutes is generous for an append, and turning it into an exception lets the step
        // fail visibly instead of sitting as "running" until the process dies.
        await eventStore.EventLog.Append(eventSourceId, @event).WaitAsync(TimeSpan.FromMinutes(2));
    }

    /// <summary>
    /// Reports a step failure both to the job (the <see cref="JobStepResult.Failed(string[])"/> the
    /// caller returns) and to the show (a <see cref="ShowProductionFailed"/> the read model turns
    /// into Status = Failed with the reason). The append is best-effort - the returned message is
    /// the authoritative one.
    /// </summary>
    /// <param name="grain">The step grain (its primary key carries scope and namespace).</param>
    /// <param name="chronicleClient">The <see cref="IChronicleClient"/> to append through.</param>
    /// <param name="eventSourceId">The show the job works on.</param>
    /// <param name="stage">The pipeline stage that failed (plan, voice, time, package, render).</param>
    /// <param name="exception">The exception that failed the step.</param>
    /// <param name="logger">The step's logger.</param>
    /// <returns>The failure message for <see cref="JobStepResult.Failed(string[])"/>.</returns>
    public static async Task<string> ReportFailure(IAddressable grain, IChronicleClient chronicleClient, EventSourceId eventSourceId, string stage, Exception exception, ILogger logger)
    {
        var reason = exception.Message;
        LogStepFailed(logger, eventSourceId.Value, stage, exception);
        try
        {
            await Append(grain, chronicleClient, eventSourceId, new ShowProductionFailed(stage, reason));
        }
        catch (Exception report)
        {
            LogReportFailed(logger, eventSourceId.Value, report);
        }

        return reason;
    }

    [LoggerMessage(0, LogLevel.Error, "Job step for {EventSourceId} failed in the {Stage} stage")]
    static partial void LogStepFailed(ILogger logger, string eventSourceId, string stage, Exception exception);

    [LoggerMessage(1, LogLevel.Warning, "Could not append the failure event for {EventSourceId}")]
    static partial void LogReportFailed(ILogger logger, string eventSourceId, Exception exception);
}
