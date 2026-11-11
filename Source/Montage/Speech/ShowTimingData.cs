// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Text.Json;
using System.Text.Json.Serialization;

namespace Montage.Speech;

/// <summary>
/// Builds the two data artifacts the montage engine consumes: word-timed lyrics
/// (data/lyrics.json) and the voice envelope analysis (data/audio.json).
/// </summary>
public static class ShowTimingData
{
    static readonly JsonSerializerOptions _json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>
    /// Splits spoken text into lyric lines (sentences), one entry per sentence.
    /// </summary>
    /// <param name="spoken">The spoken text of one scene.</param>
    /// <returns>The sentences, in order.</returns>
    public static IReadOnlyList<string> SplitIntoLines(string spoken)
    {
        var parts = spoken
            .Replace("!\u2026", "!\u2026")
            .Split([". ", "! ", "? ", ".\u2026", "\u2026 "], StringSplitOptions.TrimEntries)
            .Select(s => s.Trim())
            .Where(s => s.Length > 0)
            .ToList();
        if (parts.Count == 0 && spoken.Trim().Length > 0) parts.Add(spoken.Trim());
        return parts;
    }

    /// <summary>
    /// Builds the lyrics document from the scene texts and their transcribed (or estimated) words.
    /// </summary>
    /// <param name="lines">All lyric lines across the show, in order, with their scene id and window.</param>
    /// <param name="words">All transcribed words, in order.</param>
    /// <param name="audioDuration">Total audio duration, used when words run out.</param>
    /// <returns>The lyrics JSON document (matches the engine's Lyrics schema).</returns>
    public static string BuildLyricsJson(IReadOnlyList<(string SceneId, string Text, double WindowStart, double WindowEnd)> lines, IReadOnlyList<TranscribedWord> words, double audioDuration)
    {
        var lineDocs = new List<object>();
        var wordIndex = 0;

        foreach (var (sceneId, text, windowStart, windowEnd) in lines)
        {
            var line = BuildLine(new LyricLine(sceneId, text, windowStart, windowEnd), words, ref wordIndex);
            if (line is not null) lineDocs.Add(line);
        }

        return JsonSerializer.Serialize(new { lines = lineDocs }, _json);
    }

    /// <summary>
    /// Builds the audio analysis document: RMS envelope at 100 Hz plus word onsets.
    /// </summary>
    /// <param name="wavPath">Path of the voiceover WAV.</param>
    /// <param name="lyricsJson">The lyrics JSON (for word onsets).</param>
    /// <returns>The audio analysis JSON (matches the engine's AudioData schema).</returns>
    public static string BuildAudioAnalysisJson(string wavPath, string lyricsJson)
    {
        var (samples, sampleRate) = Wav.ReadMonoSamples(wavPath);
        const int fps = 100;
        var envelope = BuildEnvelope(samples, sampleRate, fps);
        var onsets = BuildOnsets(lyricsJson, envelope, fps);

        return JsonSerializer.Serialize(
            new
            {
                duration = Round(samples.Length / (double)sampleRate),
                fps,
                features = new { rms = envelope },
                onsets = new { vocal = onsets },
            },
            _json);
    }

    static object? BuildLine(LyricLine source, IReadOnlyList<TranscribedWord> words, ref int wordIndex)
    {
        var lineWords = SplitWords(source.Text);
        var wordDocs = new List<object>();
        var lineStart = -1d;
        var lineEnd = -1d;

        foreach (var lw in lineWords)
        {
            var (start, end) = wordIndex < words.Count
                ? (words[wordIndex].Start, words[wordIndex++].End)
                : EstimateWord(lineWords.Length - wordDocs.Count, source, lineEnd);
            wordDocs.Add(new { w = lw, start = Round(start), end = Round(end) });
            if (lineStart < 0) lineStart = start;
            lineEnd = end;
        }

        if (wordDocs.Count == 0) return null;
        return new
        {
            text = source.Text,
            sceneId = source.SceneId,
            start = Round(lineStart),
            end = Round(lineEnd),
            words = wordDocs,
        };
    }

    // no transcription for this word: estimate from the remaining window
    static (double Start, double End) EstimateWord(int remaining, LyricLine source, double lineEnd)
    {
        var start = Math.Max(lineEnd, source.WindowStart);
        var span = Math.Max(0.2, source.WindowEnd - start - 0.15);
        var dur = Math.Clamp(span / Math.Max(remaining, 1), 0.12, 0.7);
        return (start, start + dur);
    }

    static double[] BuildEnvelope(float[] samples, int sampleRate, int fps)
    {
        var envelopeLength = Math.Max(1, (int)Math.Ceiling(samples.Length / (double)sampleRate * fps));
        var envelope = new double[envelopeLength];
        var framesPerEnvelope = sampleRate / (double)fps;
        for (var i = 0; i < envelopeLength; i++)
        {
            var from = (long)(i * framesPerEnvelope);
            var to = Math.Min(samples.Length, (long)((i + 1) * framesPerEnvelope));
            double sum = 0;
            var count = 0;
            for (var s = from; s < to; s++)
            {
                sum += samples[s] * samples[s];
                count++;
            }
            var rms = count > 0 ? Math.Sqrt(sum / count) : 0;
            envelope[i] = Round(Math.Clamp(rms * 4.0, 0, 1)); // normalize speech levels into a usable 0..1
        }
        return envelope;
    }

    // word onsets from the lyrics, strength from the envelope at the onset
    static List<object> BuildOnsets(string lyricsJson, double[] envelope, int fps)
    {
        var onsets = new List<object>();
        using var lyricsDoc = JsonDocument.Parse(lyricsJson);
        var wordStarts = lyricsDoc.RootElement.GetProperty("lines").EnumerateArray()
            .SelectMany(line => line.GetProperty("words").EnumerateArray())
            .Select(word => word.GetProperty("start").GetDouble());
        foreach (var start in wordStarts)
        {
            var idx = Math.Clamp((int)(start * fps), 0, envelope.Length - 1);
            onsets.Add(new[] { Round(start), envelope[idx] });
        }
        return onsets;
    }

    sealed record LyricLine(string SceneId, string Text, double WindowStart, double WindowEnd);

    static double Round(double v) => Math.Round(v, 3, MidpointRounding.AwayFromZero);

    static string[] SplitWords(string text) =>
        text.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
