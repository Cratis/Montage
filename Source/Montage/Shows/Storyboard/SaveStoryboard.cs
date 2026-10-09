// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Text.Json;
using Cratis.Arc.ModelBinding;
using Montage.AI;

namespace Montage.Shows.Storyboard;

/// <summary>
/// One scene as the visual editor sends it - exactly the shape of a planned scene, with the
/// type-specific parameters left as the free-form object they are.
/// </summary>
/// <param name="Type">The engine scene type (title, kinetic, statement, steps, compare, flow, metric, chart, quote, code, endcard).</param>
/// <param name="Spoken">What is narrated over the scene.</param>
/// <param name="Params">The scene's visual parameters.</param>
public record StoryboardSceneInput(string Type, string Spoken, IReadOnlyDictionary<string, JsonElement>? Params);

/// <summary>
/// Represents a command to save the storyboard from the visual editor: the plan is written to
/// disk (the source of truth every stage reads) and production re-runs from the voice onward.
/// </summary>
/// <param name="ShowId">The show being edited.</param>
/// <param name="Title">The show's title.</param>
/// <param name="Voice">The TTS voice to speak with.</param>
/// <param name="Scenes">The scenes, in story order.</param>
/// <param name="Render">True also renders the mp4; a plain save records the voice, re-times and re-packages so the show stays workable.</param>
[Command]
public record SaveStoryboard(ShowId ShowId, string Title, string Voice, IReadOnlyList<StoryboardSceneInput> Scenes, bool Render = true)
{
    /// <summary>
    /// Handles the command: normalizes the storyboard into a <see cref="ShowPlan"/>, writes it as
    /// the show's plan and produces the event that re-runs production.
    /// </summary>
    /// <param name="artifactStore">The artifact store, where the plan lives on disk.</param>
    /// <returns>The event source id and the event to append.</returns>
    public (EventSourceId, ShowStoryboardSaved) Handle(ShowArtifactStore artifactStore)
    {
        var scenes = new List<PlannedScene>();
        foreach (var scene in Scenes)
        {
            var spoken = scene.Spoken?.Trim() ?? string.Empty;
            if (spoken.Length == 0 && scene.Type != "endcard") continue;
            scenes.Add(new PlannedScene
            {
                Type = scene.Type?.Trim() ?? "kinetic",
                Spoken = spoken,
                Params = scene.Params ?? new Dictionary<string, JsonElement>(),
            });
        }

        if (scenes.Count == 0)
        {
            throw new ShowPlanningFailed("A storyboard needs at least one scene with narration.");
        }
        if (scenes[^1].Type != "endcard")
        {
            scenes.Add(new PlannedScene { Type = "endcard", Spoken = string.Empty });
        }

        var plan = new ShowPlan
        {
            Title = Title?.Trim() is { Length: > 0 } t ? t : "Untitled show",
            Scenes = scenes,
        };
        var planJson = ShowPlanner.Serialize(plan);
        ShowArtifactStore.WriteText(artifactStore.PlanJson(ShowId), planJson);

        return (ShowId, new ShowStoryboardSaved(
            string.IsNullOrWhiteSpace(Voice) ? "af_heart" : Voice.Trim(),
            planJson,
            Render));
    }
}
