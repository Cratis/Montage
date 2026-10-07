// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Motion.Speech;

namespace Motion.AI;

/// <summary>
/// One scene of a planned show: what it looks like (type + params) and what is spoken over it.
/// </summary>
public sealed record PlannedScene
{
    /// <summary>
    /// Gets the scene type from the engine's registry (title, kinetic, statement, steps, compare, flow, metric, chart, quote, code, endcard).
    /// </summary>
    public string Type { get; init; } = "kinetic";

    /// <summary>
    /// Gets what is spoken over this scene — the narration.
    /// </summary>
    public string Spoken { get; init; } = string.Empty;

    /// <summary>
    /// Gets the scene's visual parameters (type-specific), written straight into the spec.
    /// </summary>
    public IReadOnlyDictionary<string, JsonElement> Params { get; init; } = new Dictionary<string, JsonElement>();
}

/// <summary>
/// A full show plan produced by the language model.
/// </summary>
public sealed record ShowPlan
{
    /// <summary>
    /// Gets the title the planner chose.
    /// </summary>
    public string Title { get; init; } = string.Empty;

    /// <summary>
    /// Gets the scenes, in story order.
    /// </summary>
    public IReadOnlyList<PlannedScene> Scenes { get; init; } = [];
}

/// <summary>
/// Plans a show from a description: asks the language model for a story (scenes + narration),
/// validates it against what the engine can actually render, and normalizes it.
/// </summary>
public static partial class ShowPlanner
{
    /// <summary>
    /// The scene types the engine knows, with what each is for — the model picks from these.
    /// </summary>
    public const string SceneCatalog = """
        - "title": an opener. params: kicker (short mono label, e.g. "motion as code"), headline (2-8 words), emphasis (optional single word from the headline to colour), sub (optional one-liner under the headline).
        - "kinetic": the narration shown word by word, karaoke-style. params: emphasis (optional array of words to colour). Use when the words themselves are the visual.
        - "statement": one strong claim, big and centered. params: kicker (optional), headline (a claim, max 12 words), accent (optional phrase within the headline to colour).
        - "steps": a numbered how-it-works list. params: headline (optional), steps (array of 3-4 {title (3-6 words), text (one short line)}). The active step follows the narration.
        - "compare": before/after or A vs B. params: headline (optional), left ({title, points: 3 short strings}), right ({title, points: 3 short strings}), verdict (optional one line). The right side is "the better way".
        - "flow": a pipeline. params: headline (optional), kicker (optional), nodes (array of 3-5 {label (1-2 words), sub (optional 2-3 words)}). Stages light up as narrated.
        - "metric": one big number. params: value (number), format ("number"|"percent"|"currency"|"x"), label (one short line explaining it), delta (optional like "+38%" or "-12s"), spark (optional array of 8-16 numbers, the trend).
        - "chart": a simple bar or line chart. params: type ("bar"|"line"), title (optional), labels (array of short strings), values (array of numbers, same length as labels), kicker (optional).
        - "quote": a quotation. params: text (max 25 words), attribution (optional).
        - "code": a code panel. params: title (optional), kicker (optional), language ("typescript"|"csharp"|"json"|"sql"), code (the code, \\n-separated, max 14 lines), highlight (optional array of 1-based line numbers).
        - "endcard": the closing card with brand and CTA. params: headline (3-7 words), cta (optional short URL or call to action).
        """;

    /// <summary>
    /// Builds the planner prompt for a show request.
    /// </summary>
    /// <param name="description">What the video should be about.</param>
    /// <param name="targetDurationSeconds">Rough target length.</param>
    /// <param name="tone">Optional tone hint.</param>
    /// <param name="audience">Optional audience hint.</param>
    /// <returns>The system and user prompts.</returns>
    public static (string System, string User) BuildPrompt(string description, double targetDurationSeconds, string tone, string audience)
    {
        var spokenWords = Math.Round(targetDurationSeconds * 2.7, MidpointRounding.AwayFromZero);
        var totalSeconds = Math.Round(targetDurationSeconds, MidpointRounding.AwayFromZero);
        var toneLine = string.IsNullOrWhiteSpace(tone) ? "confident, precise, calm" : tone;
        var audienceLine = string.IsNullOrWhiteSpace(audience) ? "technically literate" : audience;
        var system = $"""
            You plan short motion-graphics videos. A deterministic render engine turns your plan into a
            video with a voiceover: every scene is spoken over by narration while showing animated
            infographics. You reply with ONLY a JSON object, no markdown fences, no commentary.

            Story rules:
            - Open with a hook (title or statement), develop 3-8 points, close with an endcard.
            - {totalSeconds} seconds total. Spoken pace is about 2.7 words per second.
              Total spoken words across all scenes must be near {spokenWords}.
            - Narration is plain spoken English: short sentences, no markdown, no lists, no emoji,
              no stage directions, no quotes around the text. Numbers under 10 are written out
              ("three steps") unless they are data (write "38%" and it is spoken "38 percent").
            - What is spoken and what is on screen are different things. Never put long sentences on
              screen. Screen text is labels, claims, numbers; the narration carries the story.
            - One idea per scene. Vary the scene types; do not use the same type twice in a row.
            - The tone: {toneLine}. The audience: {audienceLine}.
            - The last scene must be an endcard. The first scene is a title or a statement.

            Available scene types and their params:
            {SceneCatalog}

            Reply exactly in this JSON shape:
            {JsonShape}
            """;
        var user = $"Make a video about: {description}";
        return (system, user);
    }

    const string JsonShape = /*lang=json,strict*/ """
        {
          "title": "the video's title, 2-6 words",
          "scenes": [
            { "type": "title", "spoken": "what the voice says over this scene", "params": { "kicker": "...", "headline": "..." } },
            { "type": "...", "spoken": "...", "params": { } }
          ]
        }
        """;

    static readonly JsonSerializerOptions _json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    [GeneratedRegex(@"\s+", RegexOptions.None, 500)]
    private static partial Regex Whitespace { get; }

    /// <summary>
    /// Parses and normalizes the model's answer into a <see cref="ShowPlan"/>.
    /// </summary>
    /// <param name="answer">The raw completion text.</param>
    /// <returns>The plan.</returns>
    public static ShowPlan Parse(string answer)
    {
        var json = ExtractJson(answer);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var title = root.TryGetProperty("title", out var titleEl) ? titleEl.GetString()?.Trim() ?? string.Empty : string.Empty;
        var scenes = new List<PlannedScene>();
        if (root.TryGetProperty("scenes", out var scenesEl) && scenesEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var s in scenesEl.EnumerateArray())
            {
                var type = s.TryGetProperty("type", out var typeEl) ? typeEl.GetString() ?? "kinetic" : "kinetic";
                var spoken = s.TryGetProperty("spoken", out var spokenEl) ? CleanSpoken(spokenEl.GetString()) : string.Empty;
                var parameters = new Dictionary<string, JsonElement>();
                if (s.TryGetProperty("params", out var paramsEl) && paramsEl.ValueKind == JsonValueKind.Object)
                {
                    foreach (var p in paramsEl.EnumerateObject())
                    {
                        parameters[p.Name] = p.Value.Clone();
                    }
                }
                if (spoken.Length == 0 && type != "endcard") continue;
                scenes.Add(new PlannedScene
                {
                    Type = type.Trim(),
                    Spoken = spoken,
                    Params = parameters,
                });
            }
        }
        if (scenes.Count == 0) throw new ShowPlanningFailed("The model returned no scenes.");
        if (scenes[^1].Type != "endcard")
        {
            scenes.Add(new PlannedScene { Type = "endcard", Spoken = string.Empty, Params = new Dictionary<string, JsonElement>() });
        }
        return new ShowPlan { Title = string.IsNullOrWhiteSpace(title) ? "Untitled show" : title, Scenes = scenes };
    }

    /// <summary>
    /// Serializes a plan for storage in an event.
    /// </summary>
    /// <param name="plan">The plan.</param>
    /// <returns>JSON.</returns>
    public static string Serialize(ShowPlan plan) => JsonSerializer.Serialize(plan, _json);

    /// <summary>
    /// Deserializes a stored plan.
    /// </summary>
    /// <param name="json">The stored JSON.</param>
    /// <returns>The plan, or null when it cannot be read.</returns>
    public static ShowPlan? Deserialize(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            return JsonSerializer.Deserialize<ShowPlan>(json, _json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    static string ExtractJson(string answer)
    {
        var text = answer.Trim();

        // strip markdown fences if the model added them anyway
        if (text.StartsWith("```", StringComparison.Ordinal))
        {
            var first = text.IndexOf('\n');
            var last = text.LastIndexOf("```", StringComparison.Ordinal);
            if (first > 0 && last > first) text = text[(first + 1)..last].Trim();
        }
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start) throw new ShowPlanningFailed("The model's answer contains no JSON object.");
        return text[start..(end + 1)];
    }

    static string CleanSpoken(string? spoken)
    {
        if (string.IsNullOrWhiteSpace(spoken)) return string.Empty;
        var text = spoken.Trim();
        text = text.Trim('"', '\u201C', '\u201D');
        return Whitespace.Replace(text, " ");
    }
}

/// <summary>
/// Thrown when planning fails.
/// </summary>
public class ShowPlanningFailed(string message, Exception? inner = default) : Exception(message, inner);
