// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Montage.Speech;

/// <summary>
/// Transcribes spoken audio with word-level timestamps using the self-hosted, OpenAI-compatible
/// speech-to-text service (e.g. Speaches / faster-whisper at /v1/audio/transcriptions). This is
/// what turns the synthesized voiceover into word-timed lyrics.
/// </summary>
public interface ISpeechTranscriber
{
    /// <summary>
    /// Gets a value indicating whether a speech-to-text service is configured.
    /// </summary>
    bool IsEnabled { get; }

    /// <summary>
    /// Transcribes the given WAV file, returning words with start/end times.
    /// </summary>
    /// <param name="wavPath">Path of the WAV file to transcribe.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The words, in order, with times in seconds.</returns>
    Task<IReadOnlyList<TranscribedWord>> TranscribeWithWordTimings(string wavPath, CancellationToken cancellationToken);
}

/// <summary>
/// A transcribed word with its time window.
/// </summary>
/// <param name="Word">The word.</param>
/// <param name="Start">Start time, in seconds.</param>
/// <param name="End">End time, in seconds.</param>
public record TranscribedWord(string Word, double Start, double End);

/// <summary>
/// Initializes a new instance of the <see cref="SpeechTranscriber"/> class.
/// </summary>
/// <param name="options">The Montage options carrying the STT configuration.</param>
/// <param name="logger">The logger.</param>
public sealed partial class SpeechTranscriber(IOptions<MontageOptions> options, ILogger<SpeechTranscriber> logger) : ISpeechTranscriber
{
    static readonly HttpClient _http = new() { Timeout = TimeSpan.FromMinutes(10) };

    /// <inheritdoc/>
    public bool IsEnabled => options.Value.Stt.IsEnabled;

    /// <inheritdoc/>
    public async Task<IReadOnlyList<TranscribedWord>> TranscribeWithWordTimings(string wavPath, CancellationToken cancellationToken)
    {
        var stt = options.Value.Stt;
        if (!stt.IsEnabled) throw new SpeechTranscriptionFailed("No speech-to-text service is configured.");

        var requestUri = new Uri($"{stt.Endpoint.TrimEnd('/')}/v1/audio/transcriptions");
        using var content = new MultipartFormDataContent();
        await using var file = File.OpenRead(wavPath);
        var fileContent = new StreamContent(file);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");
        content.Add(fileContent, "file", Path.GetFileName(wavPath));
        content.Add(new StringContent(stt.ModelName), "model");
        content.Add(new StringContent("verbose_json"), "response_format");
        content.Add(new StringContent("word"), "timestamp_granularities[]");
        if (!string.IsNullOrWhiteSpace(stt.Language))
        {
            content.Add(new StringContent(stt.Language), "language");
        }
        using var request = new HttpRequestMessage(HttpMethod.Post, requestUri) { Content = content };
        if (!string.IsNullOrWhiteSpace(stt.ApiKey))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", stt.ApiKey);
        }

        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            LogUnreachable(logger, exception, requestUri);
            throw new SpeechTranscriptionFailed($"The speech-to-text service at '{requestUri}' could not be reached.", exception);
        }
        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                LogFailure(logger, (int)response.StatusCode, body.Length > 500 ? body[..500] : body);
                throw new SpeechTranscriptionFailed($"The speech-to-text service responded with status {(int)response.StatusCode}.");
            }
            var json = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
            var words = new List<TranscribedWord>();
            if (json.TryGetProperty("words", out var wordsEl) && wordsEl.ValueKind == JsonValueKind.Array)
            {
                foreach (var w in wordsEl.EnumerateArray())
                {
                    var text = w.TryGetProperty("word", out var wordEl) ? wordEl.GetString() : default;
                    if (string.IsNullOrWhiteSpace(text)) continue;
                    var start = w.TryGetProperty("start", out var startEl) ? startEl.GetDouble() : 0;
                    var end = w.TryGetProperty("end", out var endEl) ? endEl.GetDouble() : start;
                    words.Add(new TranscribedWord(text.Trim(), start, Math.Max(end, start + 0.02)));
                }
            }
            LogTranscribed(logger, words.Count, wavPath);
            return words;
        }
    }

    [LoggerMessage(0, LogLevel.Information, "Transcribed {Count} words from {Path}")]
    static partial void LogTranscribed(ILogger logger, int count, string path);

    [LoggerMessage(1, LogLevel.Error, "Speech-to-text service at {Uri} unreachable")]
    static partial void LogUnreachable(ILogger logger, Exception exception, Uri uri);

    [LoggerMessage(2, LogLevel.Error, "Speech-to-text service responded {Status}: {Body}")]
    static partial void LogFailure(ILogger logger, int status, string body);
}

/// <summary>
/// Thrown when speech transcription fails.
/// </summary>
public class SpeechTranscriptionFailed(string message, Exception? inner = default) : Exception(message, inner);
