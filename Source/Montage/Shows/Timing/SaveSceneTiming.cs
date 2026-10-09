// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Arc.ModelBinding;

namespace Montage.Shows.Timing;

/// <summary>
/// One word's timing as the editor sends it - absolute show time in seconds.
/// </summary>
/// <param name="Word">The word itself.</param>
/// <param name="Start">When the word starts being spoken.</param>
/// <param name="End">When the word stops being spoken.</param>
public record TimingWordEdit(string Word, double Start, double End);

/// <summary>
/// Represents a command to save hand-adjusted word timings for one scene: the speech-to-text
/// alignment is good, not perfect, and a human dragging a word onto the waveform it belongs
/// to is the last mile of karaoke-accurate motion.
/// </summary>
/// <param name="ShowId">The show being edited.</param>
/// <param name="SceneNumber">Which scene (1-based) the words belong to.</param>
/// <param name="Words">The scene's words with their adjusted timings.</param>
[Command]
public record SaveSceneTiming(ShowId ShowId, int SceneNumber, IReadOnlyList<TimingWordEdit> Words)
{
    /// <summary>
    /// Handles the command: validates the words and produces the event that persists them.
    /// </summary>
    /// <returns>The event source id and the event to append.</returns>
    public (EventSourceId, SceneTimingSaved) Handle()
    {
        if (SceneNumber < 1) throw new SceneTimingInvalid("The scene number must be 1 or higher.");
        if (Words.Count == 0) throw new SceneTimingInvalid("A scene needs at least one word to time.");
        foreach (var word in Words)
        {
            if (string.IsNullOrWhiteSpace(word.Word)) throw new SceneTimingInvalid("Words cannot be empty.");
            if (word.Start < 0 || word.End < 0) throw new SceneTimingInvalid("Timings cannot be negative.");
            if (word.End <= word.Start) throw new SceneTimingInvalid($"'{word.Word}' ends before it starts.");
        }

        return (ShowId, new SceneTimingSaved(SceneNumber, Words));
    }
}

/// <summary>
/// Represents a validation failure for hand-adjusted timings.
/// </summary>
/// <param name="Message">Why the timings were rejected.</param>
public class SceneTimingInvalid(string Message) : Exception(Message);
