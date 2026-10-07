// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Motion.Speech;

namespace Motion.Speech;

/// <summary>
/// Synthesizes speech audio from text using the self-hosted, OpenAI-compatible text-to-speech
/// service (e.g. Kokoro-FastAPI). Same contract Studio uses: POST {endpoint}/v1/audio/speech.
/// </summary>
public interface ISpeechSynthesizer
{
    /// <summary>
    /// Gets a value indicating whether a text-to-speech service is configured.
    /// </summary>
    bool IsEnabled { get; }

    /// <summary>
    /// Synthesizes the given text into a WAV file on disk and returns its duration in seconds.
    /// </summary>
    /// <param name="text">The text to speak.</param>
    /// <param name="destination">Where to write the WAV file.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <param name="voice">Optional voice override; falls back to the configured default.</param>
    /// <returns>Duration of the synthesized audio, in seconds.</returns>
    Task<double> SynthesizeToWav(string text, string destination, CancellationToken cancellationToken, string? voice = null);
}

/// <summary>
/// Initializes a new instance of the <see cref="SpeechSynthesizer"/> class.
/// </summary>
/// <param name="options">The Motion options carrying the TTS configuration.</param>
/// <param name="logger">The logger.</param>
public sealed partial class SpeechSynthesizer(IOptions<MotionOptions> options, ILogger<SpeechSynthesizer> logger) : ISpeechSynthesizer
{
    const int FailureBodyLimit = 500;

    static readonly HttpClient _http = new() { Timeout = TimeSpan.FromMinutes(5) };

    static readonly JsonSerializerOptions _jsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

    /// <inheritdoc/>
    public bool IsEnabled => options.Value.Tts.IsEnabled;

    /// <inheritdoc/>
    public async Task<double> SynthesizeToWav(string text, string destination, CancellationToken cancellationToken, string? voice = null)
    {
        var tts = options.Value.Tts;
        if (!tts.IsEnabled) throw new SpeechSynthesisFailed("No text-to-speech service is configured.");

        var requestUri = new Uri($"{tts.Endpoint.TrimEnd('/')}/v1/audio/speech");
        using var request = new HttpRequestMessage(HttpMethod.Post, requestUri)
        {
            Content = JsonContent.Create(
                new SpeechRequest(tts.ModelName, text, string.IsNullOrWhiteSpace(voice) ? tts.Voice : voice, "wav", false),
                options: _jsonOptions),
        };
        if (!string.IsNullOrWhiteSpace(tts.ApiKey))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tts.ApiKey);
        }

        using var response = await TrySend(request, requestUri, cancellationToken);
        Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
        await using (var file = File.Create(destination))
        {
            await response.Content.CopyToAsync(file, cancellationToken);
        }
        var duration = Wav.ReadDuration(destination);

        // A TTS service that is still warming up can return near-silent audio; that is a
        // failure, not a voice — fail the stage with a readable reason instead of rendering
        // a video with no narration (the stage can be retried once the service is ready).
        var (samples, _) = Wav.ReadMonoSamples(destination);
        var peak = samples.Length > 0 ? samples.Max(Math.Abs) : 0;
        if (peak < 0.02)
        {
            throw new SpeechSynthesisFailed(
                $"The text-to-speech service returned near-silent audio (peak {peak:F3}) — " +
                "it is probably still loading its model. Retry in a moment.");
        }

        LogSynthesized(logger, text.Length, duration, destination);
        return duration;
    }

    async Task<HttpResponseMessage> TrySend(HttpRequestMessage request, Uri requestUri, CancellationToken cancellationToken)
    {
        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            LogSpeechServiceUnreachable(logger, exception, requestUri);
            throw new SpeechSynthesisFailed($"The text-to-speech service at '{requestUri}' could not be reached.", exception);
        }
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            LogSpeechServiceFailure(logger, (int)response.StatusCode, body.Length > FailureBodyLimit ? body[..FailureBodyLimit] : body);
            response.Dispose();
            throw new SpeechSynthesisFailed($"The text-to-speech service responded with status {(int)response.StatusCode}.");
        }
        return response;
    }

    sealed record SpeechRequest(string Model, string Input, string Voice, string ResponseFormat, bool Stream);

    [LoggerMessage(0, LogLevel.Information, "Synthesized {Characters} characters -> {Duration:F2}s at {Path}")]
    static partial void LogSynthesized(ILogger logger, int characters, double duration, string path);

    [LoggerMessage(1, LogLevel.Error, "Speech service at {Uri} unreachable")]
    static partial void LogSpeechServiceUnreachable(ILogger logger, Exception exception, Uri uri);

    [LoggerMessage(2, LogLevel.Error, "Speech service responded {Status}: {Body}")]
    static partial void LogSpeechServiceFailure(ILogger logger, int status, string body);
}

/// <summary>
/// Thrown when speech synthesis fails.
/// </summary>
public class SpeechSynthesisFailed(string message, Exception? inner = default) : Exception(message, inner);
