// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Events;

namespace Motion.Shows.Storyboard;

/// <summary>
/// Occurs when the storyboard is saved from the visual editor: the voice and the whole plan
/// (scenes, narration, per-scene visual parameters) travel together, and production re-runs
/// from the voiceover onward.
/// </summary>
/// <param name="Voice">The TTS voice to speak the narration with.</param>
/// <param name="PlanJson">The full plan as JSON - the same shape the planner produces.</param>
/// <param name="StartProduction">True re-runs production (voice onward); a plain save only persists the story.</param>
[EventType]
public record ShowStoryboardSaved(string Voice, string PlanJson, bool StartProduction = true);
