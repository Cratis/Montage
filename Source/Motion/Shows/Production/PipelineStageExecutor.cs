// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Collections.Concurrent;
using Cratis.Chronicle.EventSequences;
using Cratis.Chronicle.Observation;
using Motion.Shows.Production;

namespace Motion.Shows.Production;

/// <summary>
/// Runs a pipeline stage in the background: the reactor acknowledges immediately (Chronicle's
/// subscriber deadlines are seconds, while a stage legitimately runs for minutes — synthesis,
/// transcription, rendering), the work continues, and its outcome — the stage's completion
/// event or a <see cref="ShowProductionFailed"/> — is appended to the event log when it lands.
/// Work for one show is serialized; shows run in parallel.
/// </summary>
/// <param name="scopeFactory">Creates a scope per background run (the event log is scoped).</param>
public sealed class PipelineStageExecutor(IServiceScopeFactory scopeFactory)
{
    readonly ConcurrentDictionary<string, SemaphoreSlim> _gates = new();

    /// <summary>
    /// Begins a stage; the reactor returns immediately.
    /// </summary>
    /// <param name="context">The event context.</param>
    /// <param name="stage">The stage name (planning, voiceover, timing, packaging, rendering).</param>
    /// <param name="work">The work to run, producing the stage's completion event.</param>
    /// <typeparam name="TEvent">The completion event type of the stage.</typeparam>
    public void Begin<TEvent>(EventContext context, string stage, Func<Task<TEvent>> work)
        where TEvent : class
    {
        var gate = _gates.GetOrAdd(context.EventSourceId.ToString(), _ => new SemaphoreSlim(1, 1));
        _ = Task.Run(async () =>
        {
            await gate.WaitAsync();
            try
            {
                using var scope = scopeFactory.CreateScope();
                var eventLog = scope.ServiceProvider.GetRequiredService<IEventLog>();

                // TEvent is always one of the stage completion events — all [EventType]
                // records in the pipeline slices; the analyzer cannot see through the generic.
                #pragma warning disable CHR0001
                await eventLog.Append(context.EventSourceId, await work());
                #pragma warning restore CHR0001
            }
            catch (OperationCanceledException)
            {
                // shutdown: the show stays where it is; the editor's retry re-runs the stage
            }
            catch (Exception ex)
            {
                using var failureScope = scopeFactory.CreateScope();
                await failureScope.ServiceProvider
                    .GetRequiredService<IEventLog>()
                    .Append(context.EventSourceId, new ShowProductionFailed(stage, Reasonable(ex)));
            }
            finally
            {
                gate.Release();
            }
        });
    }

    static string Reasonable(Exception ex)
    {
        if (string.IsNullOrWhiteSpace(ex.Message)) return ex.GetType().Name;
        return ex.Message.Length > 800 ? ex.Message[..800] : ex.Message;
    }
}
