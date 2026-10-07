// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Diagnostics;
using System.Globalization;
using Microsoft.Extensions.Options;

namespace Motion.Shows.Rendering;

/// <summary>
/// Renders a show package to an MP4 by driving the motion-engine's offline renderer
/// (headless Chrome captures deterministic frames, ffmpeg encodes them with the voiceover muxed in).
/// </summary>
public interface IVideoRenderer
{
    /// <summary>
    /// Renders a show package to an MP4 file.
    /// </summary>
    /// <param name="showId">The show (for the output path).</param>
    /// <param name="packageDirectory">The unpacked package directory.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The path of the rendered MP4.</returns>
    Task<string> Render(ShowId showId, string packageDirectory, CancellationToken cancellationToken);
}

/// <summary>
/// Initializes a new instance of the <see cref="EngineRenderer"/> class.
/// </summary>
/// <param name="options">The Motion options.</param>
/// <param name="artifactStore">The artifact store.</param>
/// <param name="environment">The host environment.</param>
/// <param name="logger">The logger.</param>
public sealed partial class EngineRenderer(
    IOptions<MotionOptions> options,
    ShowArtifactStore artifactStore,
    IHostEnvironment environment,
    ILogger<EngineRenderer> logger) : IVideoRenderer
{
    /// <inheritdoc/>
    public async Task<string> Render(ShowId showId, string packageDirectory, CancellationToken cancellationToken)
    {
        var render = options.Value.Render;
        var script = Path.GetFullPath(render.EngineRenderScript, environment.ContentRootPath);
        var workingDirectory = Path.GetFullPath(render.WorkingDirectory, environment.ContentRootPath);
        if (!File.Exists(script))
        {
            throw new RenderFailed($"The engine render script was not found at '{script}'.");
        }

        var outputPath = Path.Combine(
            artifactStore.RendersFolderFor(showId),
            $"{DateTimeOffset.UtcNow:yyyyMMdd-HHmmss}.mp4");

        var arguments = new List<string>
        {
            script, "video",
            "--pkg", packageDirectory,
            "--out", outputPath,
            "--fps", render.Fps.ToString(CultureInfo.InvariantCulture),
            "--crf", render.Crf.ToString(CultureInfo.InvariantCulture),
            "--preset", render.Preset,
        };

        var psi = new ProcessStartInfo(render.Node, arguments)
        {
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };

        LogRenderStarted(logger, showId.Value, outputPath);
        using var process = Process.Start(psi) ?? throw new RenderFailed("The renderer could not be started (is node on PATH?).");

        var stdout = new System.Text.StringBuilder();
        var stderr = new System.Text.StringBuilder();
        process.OutputDataReceived += (_, e) => { if (e.Data is not null) lock (stdout) stdout.AppendLine(e.Data); };
        process.ErrorDataReceived += (_, e) => { if (e.Data is not null) lock (stderr) stderr.AppendLine(e.Data); };
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        try
        {
            await process.WaitForExitAsync(cancellationToken).WaitAsync(TimeSpan.FromMinutes(40), cancellationToken);
        }
        catch (TimeoutException)
        {
            process.Kill(entireProcessTree: true);
            throw new RenderFailed("The render exceeded 40 minutes and was stopped.");
        }

        if (process.ExitCode != 0 || !File.Exists(outputPath))
        {
            lock (stderr)
            {
                var tail = stderr.Length > 2000 ? stderr.ToString()[^2000..] : stderr.ToString();
                throw new RenderFailed($"The renderer exited with {process.ExitCode}. {tail}");
            }
        }
        LogRendered(logger, showId.Value, outputPath, new FileInfo(outputPath).Length);
        return outputPath;
    }

    [LoggerMessage(0, LogLevel.Information, "Rendering show {ShowId} to {Path}")]
    static partial void LogRenderStarted(ILogger logger, Guid showId, string path);

    [LoggerMessage(1, LogLevel.Information, "Rendered show {ShowId} -> {Path} ({Bytes} bytes)")]
    static partial void LogRendered(ILogger logger, Guid showId, string path, long bytes);
}

/// <summary>
/// Thrown when a render fails.
/// </summary>
public class RenderFailed(string message) : Exception(message);
