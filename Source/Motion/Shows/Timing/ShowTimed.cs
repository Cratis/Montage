// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Events;

namespace Motion.Shows.Timing;

/// <summary>
/// Occurs when the show has been timed: word-level lyrics and the audio envelope analysis are on disk.
/// </summary>
/// <param name="LyricsJson">Word-timed lyrics (lines, words, seconds).</param>
/// <param name="Render">True when the timed show should go on to packaging and render.</param>
[EventType]
public record ShowTimed(string LyricsJson, bool Render = true);

/// <summary>
/// Occurs when the user asks for timing (alignment + analysis) to be re-run.
/// </summary>
[EventType]
public record ShowTimingRequested();
