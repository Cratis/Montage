// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Arc.ModelBinding;

namespace Montage.Shows.Creation;

/// <summary>
/// Represents a request to create a show from a description — the one thing the user must give.
/// Everything else has a sensible default.
/// </summary>
/// <param name="Description">What the video should be about.</param>
/// <param name="Title">Optional working title; the planner may replace it.</param>
/// <param name="Voice">Optional TTS voice (default af_heart).</param>
/// <param name="TargetDurationSeconds">Optional target length in seconds (default 60).</param>
/// <param name="Tone">Optional tone hint.</param>
/// <param name="Audience">Optional audience hint.</param>
/// <param name="AIProviderId">Optional identity of the AI provider that will plan the show.</param>
/// <param name="PlanManually">True skips the language model: the user defines the slides by hand in the storyboard.</param>
[Command]
public record CreateShow(
    string Description,
    string? Title,
    string? Voice,
    double? TargetDurationSeconds,
    string? Tone,
    string? Audience,
    string? AIProviderId,
    bool PlanManually)
{
    /// <summary>
    /// Handles the command by producing the <see cref="ShowCreated"/> event.
    /// </summary>
    /// <returns>The new event source id and the event.</returns>
    public (EventSourceId, ShowCreated) Handle()
    {
        var showId = ShowId.New();
        var title = Title?.Trim() is { Length: > 0 } t ? t : "Untitled show";
        var voice = string.IsNullOrWhiteSpace(Voice) ? "af_heart" : Voice;
        var targetDuration = TargetDurationSeconds is > 0 ? Math.Clamp(TargetDurationSeconds.Value, 15, 300) : 60;
        return (showId, new ShowCreated(
            title,
            Description.Trim(),
            voice,
            targetDuration,
            Tone?.Trim() ?? string.Empty,
            Audience?.Trim() ?? string.Empty,
            AIProviderId?.Trim() ?? string.Empty,
            PlanManually));
    }
}
