// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.EventSequences;
using Cratis.Chronicle.Observation;
using Motion.Speech;
using Motion.Shows.Packaging;
using Motion.Shows.Production;

namespace Motion.Shows.Rendering;

/// <summary>
/// Renders the show once it is packaged: drives the engine's offline renderer and records
/// the finished MP4. The video is a file on disk, served by the editor at /renders/...
/// </summary>
/// <param name="renderer">The video renderer.</param>
/// <param name="eventLog">The event log.</param>
/// <param name="artifactStore">The artifact store.</param>
/// <param name="logger">The logger.</param>
public sealed class ShowRenderReactor(
    IVideoRenderer renderer,
    IEventLog eventLog,
    ShowArtifactStore artifactStore,
    ILogger<ShowRenderReactor> logger) : IReactor
{
    /// <summary>
    /// Renders when the package is ready.
    /// </summary>
    /// <param name="event">The packaging completion.</param>
    /// <param name="context">The event context.</param>
    /// <returns>A completed task.</returns>
    public Task On(ShowPackaged @event, EventContext context) =>
        PipelineStage.Run(eventLog, context, "rendering", () => Render(ShowId.From(context.EventSourceId), @event.PackageDirectory));

    /// <summary>
    /// Re-renders when the user asks for it.
    /// </summary>
    /// <param name="event">The request.</param>
    /// <param name="context">The event context.</param>
    /// <returns>A completed task.</returns>
    public Task On(RenderRequested @event, EventContext context) =>
        PipelineStage.Run(eventLog, context, "rendering", () =>
        {
            var showId = ShowId.From(context.EventSourceId);
            var packageDirectory = artifactStore.PackageDirectory(showId);
            if (!Directory.Exists(packageDirectory))
            {
                throw new RenderFailed("The show has no package — package it first.");
            }
            return Render(showId, packageDirectory);
        });

    async Task Render(ShowId showId, string packageDirectory)
    {
        var videoPath = await renderer.Render(showId, packageDirectory, CancellationToken.None);
        var duration = 0.0;
        try
        {
            duration = Wav.ReadDuration(artifactStore.VoiceoverWav(showId));
        }
        catch
        {
            // duration is informational; the file is what matters
        }
        var size = File.Exists(videoPath) ? new FileInfo(videoPath).Length : 0;
        await eventLog.Append(showId, new RenderCompleted(
            Path.GetRelativePath(artifactStore.FolderFor(showId), videoPath),
            duration,
            size));
    }
}
