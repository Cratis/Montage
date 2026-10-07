// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.EventSequences;
using Cratis.Chronicle.Observation;
using Motion.Shows.Production;

namespace Motion.Shows.Production;

/// <summary>
/// Shared pipeline behavior: a failed stage is recorded as an event so the editor can show it
/// and offer a retry, instead of silently spinning on a partition that can never succeed.
/// </summary>
public static class PipelineStage
{
    /// <summary>
    /// Runs a stage; on failure appends <see cref="ShowProductionFailed"/> and returns normally,
    /// so the observation offset advances and the user stays in control of the retry.
    /// </summary>
    /// <param name="eventLog">The event log.</param>
    /// <param name="context">The event context.</param>
    /// <param name="stage">The stage name (planning, voiceover, timing, packaging, rendering).</param>
    /// <param name="work">The work to run.</param>
    /// <returns>A task that completes when the stage ran (or failed into an event).</returns>
    public static async Task Run(IEventLog eventLog, EventContext context, string stage, Func<Task> work)
    {
        try
        {
            Console.Error.WriteLine($"[pipeline] {stage} for {context.EventSourceId} ({context.EventType.Id})");
            await work();
        }
        catch (OperationCanceledException)
        {
            throw; // shutdown: let Chronicle redeliver
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[pipeline] {stage} failed:\n{ex}");
            await eventLog.Append(context.EventSourceId, new ShowProductionFailed(stage, Reasonable(ex)));
        }
    }

    static string Reasonable(Exception ex) =>
        string.IsNullOrWhiteSpace(ex.Message) ? ex.GetType().Name : ex.Message.Length > 800 ? ex.Message[..800] : ex.Message;
}
