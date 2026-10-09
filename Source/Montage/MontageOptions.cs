// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.ComponentModel.DataAnnotations;

namespace Montage;

/// <summary>
/// Options for the Montage editor — where shows live on disk and which self-hosted services
/// to use for speech and language. Mirrors the Cratis pattern: TTS and STT are OpenAI-compatible
/// endpoints (e.g. Kokoro-FastAPI and Speaches/faster-whisper), the language model is either
/// OpenAI-compatible or Anthropic.
/// </summary>
public sealed record MontageOptions
{
    /// <summary>
    /// Gets the workspace root where packages and renders are written (relative to the content root).
    /// </summary>
    [Required]
    public string Workspace { get; init; } = "workspace";

    /// <summary>
    /// Gets the text-to-speech options.
    /// </summary>
    public TtsOptions Tts { get; init; } = new();

    /// <summary>
    /// Gets the speech-to-text options used for word-level alignment.
    /// </summary>
    public SttOptions Stt { get; init; } = new();

    /// <summary>
    /// Gets the language model options used for planning a show from a description.
    /// </summary>
    public AiOptions Ai { get; init; } = new();

    /// <summary>
    /// Gets the render options.
    /// </summary>
    public RenderOptions Render { get; init; } = new();

    /// <summary>
    /// Gets the resolved absolute workspace path given a content root.
    /// </summary>
    public string WorkspacePathFor(string contentRoot) => Path.GetFullPath(Workspace, contentRoot);
}

/// <summary>
/// Options for the self-hosted, OpenAI-compatible text-to-speech service (e.g. Kokoro-FastAPI at /v1/audio/speech).
/// </summary>
public sealed record TtsOptions
{
    /// <summary>
    /// Gets the base endpoint of the text-to-speech service. Empty disables voiceover synthesis.
    /// </summary>
    public string Endpoint { get; init; } = "http://localhost:8880";

    /// <summary>
    /// Gets the model identifier to request.
    /// </summary>
    public string ModelName { get; init; } = "kokoro";

    /// <summary>
    /// Gets the voice to synthesize with.
    /// </summary>
    public string Voice { get; init; } = "af_heart";

    /// <summary>
    /// Gets the API key sent to the service. Ignored by most self-hosted servers.
    /// </summary>
    public string ApiKey { get; init; } = string.Empty;

    /// <summary>
    /// Gets a value indicating whether speech synthesis is configured.
    /// </summary>
    public bool IsEnabled => !string.IsNullOrWhiteSpace(Endpoint);
}

/// <summary>
/// Options for the self-hosted, OpenAI-compatible speech-to-text service (e.g. Speaches / faster-whisper at
/// /v1/audio/transcriptions) used to derive word-level timings from the synthesized voiceover.
/// </summary>
public sealed record SttOptions
{
    /// <summary>
    /// Gets the base endpoint of the speech-to-text service. Empty disables alignment (falls back to proportional timing).
    /// </summary>
    public string Endpoint { get; init; } = "http://localhost:8770";

    /// <summary>
    /// Gets the model identifier to request.
    /// </summary>
    public string ModelName { get; init; } = "Systran/faster-whisper-tiny.en";

    /// <summary>
    /// Gets the language of the spoken audio (an ISO-639-1 code).
    /// </summary>
    public string Language { get; init; } = "en";

    /// <summary>
    /// Gets the API key sent to the service. Ignored by most self-hosted servers.
    /// </summary>
    public string ApiKey { get; init; } = string.Empty;

    /// <summary>
    /// Gets a value indicating whether alignment is configured.
    /// </summary>
    public bool IsEnabled => !string.IsNullOrWhiteSpace(Endpoint);
}

/// <summary>
/// Options for the language model used to plan a show from a description.
/// </summary>
public sealed record AiOptions
{
    /// <summary>
    /// Gets the provider kind: OpenAICompatible (OpenAI, Ollama, LM Studio, vLLM, OpenRouter...) or Anthropic.
    /// </summary>
    public string Kind { get; init; } = "OpenAICompatible";

    /// <summary>
    /// Gets the base endpoint (for OpenAICompatible, including the /v1 prefix when the server needs it).
    /// </summary>
    public string Endpoint { get; init; } = "http://localhost:11434/v1";

    /// <summary>
    /// Gets the model identifier (e.g. qwen2.5:14b, claude-sonnet-4-5, gpt-4.1).
    /// </summary>
    public string ModelName { get; init; } = "qwen2.5:14b";

    /// <summary>
    /// Gets the API key. Empty for local servers.
    /// </summary>
    public string ApiKey { get; init; } = string.Empty;

    /// <summary>
    /// Gets a value indicating whether AI planning is configured.
    /// </summary>
    public bool IsEnabled => !string.IsNullOrWhiteSpace(ModelName);
}

/// <summary>
/// Options for the video renderer (the montage-engine offline renderer driven through node).
/// </summary>
public sealed record RenderOptions
{
    /// <summary>
    /// Gets the node executable.
    /// </summary>
    public string Node { get; init; } = "node";

    /// <summary>
    /// Gets the path to the engine's render script (relative to the content root when relative).
    /// </summary>
    public string EngineRenderScript { get; init; } = "../Engine/scripts/render.ts";

    /// <summary>
    /// Gets the working directory for the render (the engine package root, for its node_modules).
    /// </summary>
    public string WorkingDirectory { get; init; } = "../Engine";

    /// <summary>
    /// Gets the x264 CRF quality (lower is better).
    /// </summary>
    public int Crf { get; init; } = 18;

    /// <summary>
    /// Gets the x264 preset.
    /// </summary>
    public string Preset { get; init; } = "medium";

    /// <summary>
    /// Gets the frames per second of the render.
    /// </summary>
    public int Fps { get; init; } = 60;
}
