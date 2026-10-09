// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Text.Json;
using Cratis.Chronicle.Observation;
using Montage.Shows.Storyboard;

namespace Montage.Shows.Timing;

/// <summary>
/// Persists hand-adjusted word timings: rewrites the scene's lines in the show's lyrics data
/// and in the packaged copy the engine preview reads, so karaoke motion follows the edit
/// immediately - without re-running the whole timing stage (which would overwrite the edit).
/// </summary>
public sealed partial class SceneTimingSavedReactor(ShowArtifactStore artifactStore, ILogger<SceneTimingSavedReactor> logger) : IReactor
{
    static readonly JsonSerializerOptions _json = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

    /// <summary>
    /// Writes the adjusted words into the scene's lyric lines.
    /// </summary>
    /// <param name="event">The saved timings.</param>
    /// <param name="context">The event context.</param>
    /// <returns>Awaitable task.</returns>
    [OnceOnly]
    public async Task On(SceneTimingSaved @event, EventContext context)
    {
        var showId = ShowId.From(context.EventSourceId);
        var sceneId = $"scene-{@event.SceneNumber}";
        var path = artifactStore.LyricsJson(showId);
        var raw = ShowArtifactStore.ReadTextOrNull(path);
        if (raw is null)
        {
            LogNoLyrics(logger, showId, sceneId);
            return;
        }

        var doc = JsonDocument.Parse(raw);
        var lines = doc.RootElement.TryGetProperty("lines", out var found) ? found : throw new SceneTimingInvalid("Lyrics data has no lines.");
        var rebuilt = new List<object>();
        foreach (var line in lines.EnumerateArray())
        {
            if (line.TryGetProperty("scene_id", out var id) && id.GetString() == sceneId)
            {
                var words = @event.Words.Select(w => (object)new Dictionary<string, object>
                {
                    ["w"] = w.Word,
                    ["start"] = Math.Round(w.Start, 3, MidpointRounding.AwayFromZero),
                    ["end"] = Math.Round(w.End, 3, MidpointRounding.AwayFromZero),
                }).ToList();
                rebuilt.Add(new Dictionary<string, object?>
                {
                    // keep the line's other properties; times and text follow the words
                    ["i"] = line.TryGetProperty("i", out var i) ? i.Clone() : 0,
                    ["scene_id"] = sceneId,
                    ["start"] = words.Count > 0 ? ((Dictionary<string, object>)words[0])["start"] : 0,
                    ["end"] = words.Count > 0 ? ((Dictionary<string, object>)words[^1])["end"] : 0,
                    ["text"] = string.Join(' ', @event.Words.Select(w => w.Word)),
                    ["words"] = words,
                });
            }
            else
            {
                rebuilt.Add(JsonSerializer.Deserialize<object>(line.GetRawText(), _json)!);
            }
        }

        var output = JsonSerializer.Serialize(new { lines = rebuilt }, _json);
        await File.WriteAllTextAsync(path, output);

        // the packaged copy is what the editor's preview loads - keep them identical
        var packaged = Path.Combine(artifactStore.PackageDirectory(showId), "data", "lyrics.json");
        if (File.Exists(packaged)) await File.WriteAllTextAsync(packaged, output);

        LogSaved(logger, showId, sceneId, @event.Words.Count);
    }

    [LoggerMessage(0, LogLevel.Information, "Hand-adjusted {Count} words for {Scene} of show {Show}")]
    static partial void LogSaved(ILogger logger, ShowId show, string scene, int count);

    [LoggerMessage(1, LogLevel.Warning, "Show {Show} has no lyrics data to adjust for {Scene}")]
    static partial void LogNoLyrics(ILogger logger, ShowId show, string scene);
}
