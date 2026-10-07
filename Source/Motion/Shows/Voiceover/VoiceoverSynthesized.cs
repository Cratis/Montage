// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Events;

namespace Motion.Shows.Voiceover;

/// <summary>
/// Occurs when the voiceover for the current plan has been synthesized to disk.
/// </summary>
/// <param name="AudioPath">Path of the voiceover audio file (mp3), relative to the show folder.</param>
/// <param name="DurationSeconds">Exact duration of the audio.</param>
[EventType]
public record VoiceoverSynthesized(string AudioPath, double DurationSeconds);

/// <summary>
/// Occurs when the user asks for the voiceover to be re-synthesized.
/// </summary>
[EventType]
public record VoiceoverSynthesisRequested();
