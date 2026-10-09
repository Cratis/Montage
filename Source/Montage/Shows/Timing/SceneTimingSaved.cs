// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Events;

namespace Montage.Shows.Timing;

/// <summary>
/// Represents the event of one scene's word timings being hand-adjusted in the editor.
/// Carries the words so the reactor can rewrite the lyrics data without re-reading state.
/// </summary>
/// <param name="SceneNumber">Which scene (1-based) was edited.</param>
/// <param name="Words">The scene's words with their adjusted timings.</param>
[EventType]
public record SceneTimingSaved(int SceneNumber, IReadOnlyList<TimingWordEdit> Words);
