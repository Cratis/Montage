// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Observation;
using Motion.Shows.Production;

namespace Motion.Shows.Production;

/// <summary>
/// Shared pipeline behavior: a stage returns the event that records its outcome. A failed
/// stage returns <see cref="ShowProductionFailed"/> instead of throwing, so the observation
/// offset advances and the user stays in control of the retry — the editor shows the error
/// and offers a per-stage retry, instead of silently spinning on a partition that can
/// never succeed.
/// </summary>
public static class PipelineStage
{
    /// <summary>
    /// Runs a stage; on failure returns <see cref="ShowProductionFailed"/> with a readable reason.
    /// </summary>
    /// <param name="context">The event context.</param>
    /// <param name="stage">The stage name (planning, voiceover, timing, packaging, rendering).</param>
    /// <param name="work">The work to run, producing the stage's completion event.</param>
    /// <typeparam name="TEvent">The completion event type of the stage.</typeparam>
    /// <returns>The events to append: the completion event, or the failure event.</returns>
    public static async Task<IEnumerable<object>> Run<TEvent>(EventContext context, string stage, Func<Task<TEvent>> work)
        where TEvent : class
    {
        try
        {
            return [await work()];
        }
        catch (OperationCanceledException)
        {
            throw; // shutdown: let Chronicle redeliver
        }
        catch (Exception ex)
        {
            return [new ShowProductionFailed(stage, Reasonable(ex))];
        }
    }

    static string Reasonable(Exception ex)
    {
        if (string.IsNullOrWhiteSpace(ex.Message)) return ex.GetType().Name;
        return ex.Message.Length > 800 ? ex.Message[..800] : ex.Message;
    }
}
