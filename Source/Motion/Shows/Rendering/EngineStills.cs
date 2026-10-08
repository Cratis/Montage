// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Diagnostics;
using Microsoft.Extensions.Options;

namespace Motion.Shows.Rendering;

/// <summary>
/// Captures one still frame per scene - the storyboard's preview thumbnails. Drives the
/// engine's offline renderer in its stills mode: one headless Chrome run captures every
/// scene at its mid-point, so each thumbnail shows the scene with its content on screen.
/// </summary>
public interface IEngineStills
{
    /// <summary>
    /// Captures a still per scene at the given times.
    /// </summary>
    /// <param name="packageDirectory">The packaged show (show.json + audio + data).</param>
    /// <param name="times">One capture time per scene, in show seconds (mid-scene).</param>
    /// <param name="outputFolder">Where the scene-XX.png files are written.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The written snapshot paths, in scene order.</returns>
    Task<IReadOnlyList<string>> CapturePerScene(string packageDirectory, IReadOnlyList<double> times, string outputFolder, CancellationToken cancellationToken);
}

/// <summary>
/// Initializes a new instance of the <see cref="EngineStills"/> class.
/// </summary>
/// <param name="options">The Motion options.</param>
/// <param name="environment">The host environment.</param>
/// <param name="logger">The logger.</param>
public sealed partial class EngineStills(IOptions<MotionOptions> options, IHostEnvironment environment, ILogger<EngineStills> logger) : IEngineStills
{
    /// <inheritdoc/>
    public async Task<IReadOnlyList<string>> CapturePerScene(string packageDirectory, IReadOnlyList<double> times, string outputFolder, CancellationToken cancellationToken)
    {
        var render = options.Value.Render;
        var script = Path.GetFullPath(render.EngineRenderScript, environment.ContentRootPath);
        var workingDirectory = Path.GetFullPath(render.WorkingDirectory, environment.ContentRootPath);
        if (!File.Exists(script)) throw new RenderFailed($"The engine render script was not found at '{script}'.");

        Directory.CreateDirectory(outputFolder);
        foreach (var stale in Directory.EnumerateFiles(outputFolder, "scene-*.png")) File.Delete(stale);

        var arguments = new List<string>
        {
            script, "stills",
            "--pkg", packageDirectory,
            "--t", string.Join(',', times.Select(t => t.ToString(System.Globalization.CultureInfo.InvariantCulture))),
            "--out", outputFolder,
        };

        var psi = new ProcessStartInfo(render.Node, arguments)
        {
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };

        LogCapturing(logger, times.Count, packageDirectory);
        using var process = Process.Start(psi) ?? throw new RenderFailed("The renderer could not be started (is node on PATH?).");

        var stderr = new System.Text.StringBuilder();
        process.ErrorDataReceived += (_, e) => { if (e.Data is not null) lock (stderr) stderr.AppendLine(e.Data); };
        process.BeginErrorReadLine();

        await process.WaitForExitAsync(cancellationToken).WaitAsync(TimeSpan.FromMinutes(10), cancellationToken);

        if (process.ExitCode != 0)
        {
            lock (stderr)
            {
                var tail = stderr.Length > 1500 ? stderr.ToString()[^1500..] : stderr.ToString();
                throw new RenderFailed($"The stills renderer exited with {process.ExitCode}. {tail}");
            }
        }

        // the stills mode writes f_00003.00.png files in capture order - rename to scene-XX.png
        var written = Directory.EnumerateFiles(outputFolder, "f_*.png").Order().ToList();
        var results = new List<string>();
        for (var i = 0; i < written.Count; i++)
        {
            var target = Path.Combine(outputFolder, $"scene-{i + 1:00}.png");
            File.Move(written[i], target, overwrite: true);
            results.Add(target);
        }

        LogCaptured(logger, results.Count);
        return results;
    }

    [LoggerMessage(0, LogLevel.Information, "Capturing {Count} scene stills from {Package}")]
    static partial void LogCapturing(ILogger logger, int count, string package);

    [LoggerMessage(1, LogLevel.Information, "Captured {Count} scene stills")]
    static partial void LogCaptured(ILogger logger, int count);
}
