// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Events;

namespace Motion.Shows.Creation;

/// <summary>
/// Occurs when a new show is created from a description.
/// </summary>
/// <param name="Title">The working title (may be replaced by the planned title).</param>
/// <param name="Description">What the video should be about — the only thing the user must give.</param>
/// <param name="Voice">The TTS voice to speak the narration with.</param>
/// <param name="TargetDurationSeconds">Roughly how long the video should be, in seconds.</param>
/// <param name="Tone">Optional tone hint (e.g. "technical, calm" or "energetic launch").</param>
/// <param name="Audience">Optional audience hint (e.g. "developers evaluating event sourcing").</param>
/// <param name="AIProviderId">Optional identity of the AI provider that will plan the show.</param>
/// <param name="PlanManually">True when the user will define the slides by hand.</param>
/// <param name="PlanManually">True when the user will define the slides by hand.</param>
[EventType]
public record ShowCreated(
    string Title,
    string Description,
    string Voice,
    double TargetDurationSeconds,
    string Tone,
    string Audience,
    string AIProviderId = "",
    bool PlanManually = false);
