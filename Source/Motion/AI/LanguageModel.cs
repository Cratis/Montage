// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Motion.AI;

/// <summary>
/// Talks to a language model — OpenAI-compatible chat completions (OpenAI, Ollama, LM Studio,
/// vLLM, OpenRouter) or the Anthropic messages API. Enough for the planner: one prompt in,
/// one (JSON) answer out.
/// </summary>
public interface ILanguageModel
{
    /// <summary>
    /// Gets a value indicating whether a model is configured.
    /// </summary>
    bool IsEnabled { get; }

    /// <summary>
    /// Completes a prompt.
    /// </summary>
    /// <param name="system">The system prompt.</param>
    /// <param name="user">The user prompt.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The completion text.</returns>
    Task<string> Complete(string system, string user, CancellationToken cancellationToken);
}

/// <summary>
/// Initializes a new instance of the <see cref="LanguageModel"/> class.
/// </summary>
/// <param name="options">The Motion options carrying the AI configuration.</param>
/// <param name="logger">The logger.</param>
public sealed partial class LanguageModel(IOptions<MotionOptions> options, ILogger<LanguageModel> logger) : ILanguageModel
{
    static readonly HttpClient _http = new() { Timeout = TimeSpan.FromMinutes(10) };

    /// <inheritdoc/>
    public bool IsEnabled => options.Value.Ai.IsEnabled;

    /// <inheritdoc/>
    public async Task<string> Complete(string system, string user, CancellationToken cancellationToken)
    {
        var ai = options.Value.Ai;
        if (!ai.IsEnabled) throw new AiNotConfigured("No language model is configured.");

        return ai.Kind.Equals("Anthropic", StringComparison.OrdinalIgnoreCase)
            ? await CompleteAnthropic(ai, system, user, cancellationToken)
            : await CompleteOpenAiCompatible(ai, system, user, cancellationToken);
    }

    async Task<string> CompleteOpenAiCompatible(AiOptions ai, string system, string user, CancellationToken cancellationToken)
    {
        var endpoint = ai.Endpoint.TrimEnd('/');
        if (!endpoint.EndsWith("/v1", StringComparison.Ordinal) && !endpoint.Contains("/v1/", StringComparison.Ordinal))
        {
            endpoint += "/v1";
        }
        var requestUri = new Uri($"{endpoint}/chat/completions");
        using var request = new HttpRequestMessage(HttpMethod.Post, requestUri)
        {
            Content = JsonContent.Create(new
            {
                model = ai.ModelName,
                messages = new object[]
                {
                    new { role = "system", content = system },
                    new { role = "user", content = user },
                },
                temperature = 0.4,
            }),
        };
        if (!string.IsNullOrWhiteSpace(ai.ApiKey))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ai.ApiKey);
        }

        using var response = await Send(request, requestUri, cancellationToken);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
        var content = json.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString();
        LogCompleted(logger, ai.ModelName, content?.Length ?? 0);
        return content ?? string.Empty;
    }

    async Task<string> CompleteAnthropic(AiOptions ai, string system, string user, CancellationToken cancellationToken)
    {
        var requestUri = new Uri($"{ai.Endpoint.TrimEnd('/')}/v1/messages");
        using var request = new HttpRequestMessage(HttpMethod.Post, requestUri)
        {
            Content = JsonContent.Create(new
            {
                model = ai.ModelName,
                max_tokens = 8000,
                system,
                messages = new object[] { new { role = "user", content = user } },
            }),
        };
        request.Headers.Add("x-api-key", ai.ApiKey);
        request.Headers.Add("anthropic-version", "2023-06-01");

        using var response = await Send(request, requestUri, cancellationToken);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
        var text = new System.Text.StringBuilder();
        foreach (var block in json.GetProperty("content").EnumerateArray())
        {
            if (block.TryGetProperty("text", out var t)) text.Append(t.GetString());
        }
        LogCompleted(logger, ai.ModelName, text.Length);
        return text.ToString();
    }

    async Task<HttpResponseMessage> Send(HttpRequestMessage request, Uri requestUri, CancellationToken cancellationToken)
    {
        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            LogUnreachable(logger, exception, requestUri);
            throw new AiNotConfigured($"The language model at '{requestUri}' could not be reached.", exception);
        }
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            LogFailure(logger, (int)response.StatusCode, body.Length > 500 ? body[..500] : body);
            response.Dispose();
            throw new AiNotConfigured($"The language model responded with status {(int)response.StatusCode}.");
        }
        return response;
    }

    [LoggerMessage(0, LogLevel.Information, "LLM {Model} completed {Characters} characters")]
    static partial void LogCompleted(ILogger logger, string model, int characters);

    [LoggerMessage(1, LogLevel.Error, "Language model at {Uri} unreachable")]
    static partial void LogUnreachable(ILogger logger, Exception exception, Uri uri);

    [LoggerMessage(2, LogLevel.Error, "Language model responded {Status}: {Body}")]
    static partial void LogFailure(ILogger logger, int status, string body);
}

/// <summary>
/// Thrown when the language model is not usable.
/// </summary>
public class AiNotConfigured(string message, Exception? inner = default) : Exception(message, inner);
