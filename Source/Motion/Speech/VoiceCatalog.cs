// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Motion.Speech;

namespace Motion.Speech;

/// <summary>
/// The voices the self-hosted text-to-speech service actually offers, and a way to hear one
/// before committing the whole show to it. The editor's voice dropdown feeds from this.
/// </summary>
public sealed class VoiceCatalog(ISpeechSynthesizer synthesizer, IOptions<MotionOptions> options)
{
    /// <summary>
    /// The voices Kokoro ships, used when the service's own catalog can't be reached.
    /// </summary>
    static readonly string[] _fallbackVoices =
    [
        "af_heart", "af_bella", "af_nicole", "af_aoede", "af_kore", "af_sarah", "af_sky", "af_alloy", "af_jessica", "af_nova", "af_river",
        "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_puck",
        "bf_emma", "bf_isabella", "bf_alice", "bf_lily",
        "bm_george", "bm_fable", "bm_lewis", "bm_daniel",
    ];

    /// <summary>
    /// Lists the available voices - from the service's own catalog when reachable.
    /// </summary>
    /// <returns>The voice identifiers.</returns>
    public async Task<object> All()
    {
        var tts = options.Value.Tts;
        if (synthesizer.IsEnabled)
        {
            try
            {
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
                using var response = await http.GetAsync($"{tts.Endpoint.TrimEnd('/')}/v1/audio/voices");
                if (response.IsSuccessStatusCode)
                {
                    var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                    if (doc.RootElement.TryGetProperty("voices", out var voices) && voices.ValueKind == JsonValueKind.Array)
                    {
                        static string Name(JsonElement v)
                        {
                            if (v.ValueKind == JsonValueKind.String) return v.GetString() ?? string.Empty;
                            foreach (var key in new[] { "id", "voice_id", "name" })
                            {
                                if (v.TryGetProperty(key, out var found) && found.ValueKind == JsonValueKind.String)
                                {
                                    return found.GetString() ?? string.Empty;
                                }
                            }
                            return string.Empty;
                        }

                        var names = voices.EnumerateArray().Select(Name)
                            .Where(v => !string.IsNullOrWhiteSpace(v))
                            .Order()
                            .ToArray();
                        if (names.Length > 0) return new { voices = names, source = "service" };
                    }
                }
            }
            catch
            {
                // fall through to the built-in catalog - a warming-up TTS must not break the editor
            }
        }

        return new { voices = _fallbackVoices, source = "built-in" };
    }

    /// <summary>
    /// Synthesizes a short audition line with the given voice so the editor can hear it.
    /// </summary>
    /// <param name="voice">The voice to audition.</param>
    /// <returns>The WAV audio of the audition line.</returns>
    public async Task<(string ContentType, byte[] Bytes, int Status, string Error)> Preview(string voice)
    {
        if (!synthesizer.IsEnabled) return ("text/plain", [], 503, "No text-to-speech service is configured.");
        var temp = Path.Combine(Path.GetTempPath(), $"motion-voice-preview-{Guid.NewGuid():N}.wav");
        try
        {
            await synthesizer.SynthesizeToWav(
                "Hi there — I could be the voice of your next video. Pick me, and let's tell a story together.",
                temp,
                CancellationToken.None,
                voice);
            return ("audio/wav", await System.IO.File.ReadAllBytesAsync(temp), 200, string.Empty);
        }
        catch (Exception ex)
        {
            return ("text/plain", [], 502, ex.Message);
        }
        finally
        {
            // PhysicalFile streams after the action returns; sweep up stale previews instead
            foreach (var stale in Directory.EnumerateFiles(Path.GetTempPath(), "motion-voice-preview-*.wav")
                .Select(f => new FileInfo(f))
                .Where(f => f.LastWriteTimeUtc < DateTime.UtcNow.AddMinutes(-10)))
            {
                try { stale.Delete(); } catch { /* best effort */ }
            }
        }
    }
}
