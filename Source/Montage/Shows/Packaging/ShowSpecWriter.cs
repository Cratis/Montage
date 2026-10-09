// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Text.Json;
using System.Text.Json.Serialization;
using Montage.AI;
using Montage.Speech;

namespace Montage.Shows.Packaging;

/// <summary>
/// Builds the montage-engine show spec (show.json) from the plan and the word timings.
/// This is where "what the model planned" becomes "what the engine can render":
/// scene windows are cut into the pauses around their words, transitions cycle,
/// captions come from the scene content, and the brand marks every frame.
/// </summary>
public static class ShowSpecWriter
{
    static readonly string[] _transitionCycle = ["crossfade", "wipe", "slide", "rise", "zoom"];

    static readonly JsonSerializerOptions _json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>
    /// The timing window of one scene, derived from the sung (spoken) words.
    /// </summary>
    public sealed record SceneWindow(string SceneId, double Start, double End);

    /// <summary>
    /// Derives scene windows from the lyrics. Each scene cuts in the pause before its first
    /// word and holds through the pause after its last; scenes without words share the tail.
    /// </summary>
    /// <param name="plan">The plan, in scene order.</param>
    /// <param name="lyricsJson">The word-timed lyrics.</param>
    /// <param name="audioDuration">Total voiceover duration.</param>
    /// <returns>Windows per scene, plus the per-line assignments used.</returns>
    public static IReadOnlyList<SceneWindow> DeriveWindows(ShowPlan plan, string lyricsJson, double audioDuration)
    {
        // group lyric lines by scene
        var linesByScene = new Dictionary<string, List<(double Start, double End)>>();
        using var doc = JsonDocument.Parse(lyricsJson);
        foreach (var line in doc.RootElement.GetProperty("lines").EnumerateArray())
        {
            string sceneId;
            if (line.TryGetProperty("scene_id", out var sceneIdEl))
            {
                sceneId = sceneIdEl.GetString() ?? string.Empty;
            }
            else
            {
                sceneId = line.TryGetProperty("sceneId", out var sceneIdAlt) ? sceneIdAlt.GetString() ?? string.Empty : string.Empty;
            }
            var start = line.GetProperty("start").GetDouble();
            var end = line.GetProperty("end").GetDouble();
            if (!linesByScene.TryGetValue(sceneId, out var list))
            {
                list = [];
                linesByScene[sceneId] = list;
            }
            list.Add((start, end));
        }

        var windows = new List<SceneWindow>();
        double cursor = 0;
        for (var i = 0; i < plan.Scenes.Count; i++)
        {
            var scene = plan.Scenes[i];
            var isLast = i == plan.Scenes.Count - 1;

            // lyrics carry the positional scene id "scene-{index}"
            var key = $"scene-{i + 1}";
            double start, end;
            if (linesByScene.TryGetValue(key, out var lines) && lines.Count > 0)
            {
                var first = lines[0];
                var last = lines[^1];
                var leadIn = i == 0 ? 0.6 : 0.22;
                start = Math.Max(cursor, first.Start - leadIn);
                var tail = Math.Min(0.7, audioDuration - last.End);
                end = isLast ? audioDuration : last.End + Math.Max(0.25, Math.Min(tail, 0.7));
            }
            else
            {
                // silent scene (typically the endcard): share the remaining tail
                start = cursor;
                end = isLast ? Math.Max(audioDuration, cursor + 1.5) : cursor + 1.2;
            }
            if (end <= start) end = start + 1.0;
            windows.Add(new SceneWindow(scene.Type + i, start, end));
            cursor = end;
        }
        return windows;
    }

    /// <summary>
    /// Builds the show spec JSON.
    /// </summary>
    /// <param name="showId">The show id.</param>
    /// <param name="plan">The planned scenes.</param>
    /// <param name="windows">The scene windows.</param>
    /// <param name="audioDuration">Voiceover duration (0 for silent shows).</param>
    /// <param name="brand">Brand overlay.</param>
    /// <returns>The show spec document.</returns>
    public static ShowSpecDocument Build(Guid showId, ShowPlan plan, IReadOnlyList<SceneWindow> windows, double audioDuration, BrandOverlay? brand = default)
    {
        var scenes = new List<ShowSpecDocument.SceneSpecDocument>();
        for (var i = 0; i < plan.Scenes.Count; i++)
        {
            var planned = plan.Scenes[i];
            var window = windows.FirstOrDefault(w => w.SceneId == planned.Type + i)
                         ?? new SceneWindow(planned.Type + i, i * 5, (i + 1) * 5);
            var transition = i == 0 ? "cut" : _transitionCycle[i % _transitionCycle.Length];
            scenes.Add(new ShowSpecDocument.SceneSpecDocument
            {
                Id = $"scene-{i + 1}",
                Type = planned.Type,
                Start = Math.Round(window.Start, 3, MidpointRounding.AwayFromZero),
                End = Math.Round(window.End, 3, MidpointRounding.AwayFromZero),
                TransitionIn = transition,
                TransitionDuration = 0.55,
                Caption = CaptionFor(planned, i),
                Params = planned.Params,
            });
        }

        return new ShowSpecDocument
        {
            Id = showId.ToString(),
            Title = plan.Title,
            Voiceover = audioDuration > 0 ? "audio/voiceover.mp3" : null,
            Duration = audioDuration > 0 ? Math.Round(audioDuration, 3, MidpointRounding.AwayFromZero) : null,
            Brand = brand ?? new BrandOverlay { Name = "Cratis", Product = "Montage", MarkUrl = "/fonts/cratis-mark.svg" },
            Scenes = scenes,
        };
    }

    /// <summary>
    /// Serializes a spec document to JSON.
    /// </summary>
    /// <param name="spec">The document.</param>
    /// <returns>JSON text.</returns>
    public static string Serialize(ShowSpecDocument spec) => JsonSerializer.Serialize(spec, _json);

    static ShowSpecDocument.CaptionDocument? CaptionFor(PlannedScene scene, int index)
    {
        if (scene.Type == "title" || scene.Type == "endcard") return null;
        var text =
            GetString(scene.Params, "headline") ??
            GetString(scene.Params, "title") ??
            GetString(scene.Params, "label") ??
            (scene.Spoken.Length > 0 ? Truncate(scene.Spoken, 44) : scene.Type);
        return new ShowSpecDocument.CaptionDocument
        {
            Fig = (index + 1).ToString("00"),
            Text = Truncate(text, 48),
        };
    }

    static string? GetString(IReadOnlyDictionary<string, JsonElement> parameters, string name) =>
        parameters.TryGetValue(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    static string Truncate(string s, int max) => s.Length <= max ? s : s[..(max - 1)].TrimEnd() + "\u2026";
}

/// <summary>
/// The show spec document — mirrors the engine's ShowSpec JSON schema.
/// </summary>
public sealed record ShowSpecDocument
{
    /// <summary>
    /// Gets the package id.
    /// </summary>
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    /// <summary>
    /// Gets the title.
    /// </summary>
    [JsonPropertyName("title")]
    public string Title { get; init; } = string.Empty;

    /// <summary>
    /// Gets the voiceover path inside the package (null for silent shows).
    /// </summary>
    [JsonPropertyName("voiceover")]
    public string? Voiceover { get; init; }

    /// <summary>
    /// Gets the fallback total duration (seconds).
    /// </summary>
    [JsonPropertyName("duration")]
    public double? Duration { get; init; }

    /// <summary>
    /// Gets the brand overlay.
    /// </summary>
    [JsonPropertyName("brand")]
    public BrandOverlay Brand { get; init; } = new();

    /// <summary>
    /// Gets the scenes.
    /// </summary>
    [JsonPropertyName("scenes")]
    public IReadOnlyList<SceneSpecDocument> Scenes { get; init; } = [];

    /// <summary>
    /// One scene of the spec document.
    /// </summary>
    public sealed record SceneSpecDocument
    {
        /// <summary>
        /// Gets the scene id.
        /// </summary>
        [JsonPropertyName("id")]
        public string Id { get; init; } = string.Empty;

        /// <summary>
        /// Gets the scene type.
        /// </summary>
        [JsonPropertyName("type")]
        public string Type { get; init; } = string.Empty;

        /// <summary>
        /// Gets the start time (seconds).
        /// </summary>
        [JsonPropertyName("start")]
        public double Start { get; init; }

        /// <summary>
        /// Gets the end time (seconds).
        /// </summary>
        [JsonPropertyName("end")]
        public double End { get; init; }

        /// <summary>
        /// Gets the incoming transition kind.
        /// </summary>
        [JsonPropertyName("transitionIn")]
        public string TransitionIn { get; init; } = "crossfade";

        /// <summary>
        /// Gets the transition duration (seconds).
        /// </summary>
        [JsonPropertyName("transitionDuration")]
        public double TransitionDuration { get; init; } = 0.55;

        /// <summary>
        /// Gets the caption chip.
        /// </summary>
        [JsonPropertyName("caption")]
        public CaptionDocument? Caption { get; init; }

        /// <summary>
        /// Gets the visual parameters.
        /// </summary>
        [JsonPropertyName("params")]
        public IReadOnlyDictionary<string, JsonElement> Params { get; init; } = new Dictionary<string, JsonElement>();
    }

    /// <summary>
    /// The caption chip of a scene.
    /// </summary>
    public sealed record CaptionDocument
    {
        /// <summary>
        /// Gets the figure number.
        /// </summary>
        [JsonPropertyName("fig")]
        public string Fig { get; init; } = string.Empty;

        /// <summary>
        /// Gets the text.
        /// </summary>
        [JsonPropertyName("text")]
        public string Text { get; init; } = string.Empty;
    }
}

/// <summary>
/// The brand overlay.
/// </summary>
public sealed record BrandOverlay
{
    /// <summary>
    /// Gets the brand name.
    /// </summary>
    [JsonPropertyName("name")]
    public string Name { get; init; } = "Cratis";

    /// <summary>
    /// Gets the product label.
    /// </summary>
    [JsonPropertyName("product")]
    public string? Product { get; init; }

    /// <summary>
    /// Gets the mark URL.
    /// </summary>
    [JsonPropertyName("markUrl")]
    public string? MarkUrl { get; init; }
}
