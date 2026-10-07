// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Arc.ModelBinding;

namespace Motion.Shows.Creation;

/// <summary>
/// Represents a request to re-run a production stage for a show (regenerate the plan, the voice,
/// the timing, the package or the render). The stage runs again; everything downstream re-runs too.
/// </summary>
/// <param name="ShowId">The show to re-run.</param>
/// <param name="Stage">Which stage: plan | voice | time | package | render.</param>
[Command]
public record RegenerateShowStage(ShowId ShowId, string Stage)
{
    /// <summary>
    /// Handles the command by producing the request event for the given stage.
    /// </summary>
    /// <returns>The event source id and the event to append.</returns>
    public (EventSourceId, object) Handle() => Stage.Trim().ToLowerInvariant() switch
    {
        "plan" => (ShowId, (object)new Planning.ShowPlanningRequested()),
        "voice" => (ShowId, (object)new Voiceover.VoiceoverSynthesisRequested()),
        "time" => (ShowId, (object)new Timing.ShowTimingRequested()),
        "package" => (ShowId, (object)new Packaging.ShowPackagingRequested()),
        "render" => (ShowId, (object)new Rendering.RenderRequested()),
        _ => throw new ArgumentException($"Unknown stage '{Stage}'. Use plan, voice, time, package or render."),
    };
}
