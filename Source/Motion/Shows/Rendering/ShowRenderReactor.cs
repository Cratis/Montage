// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Observation;
using Motion.Shows.Packaging;
using Motion.Shows.Production;
using Motion.Speech;

namespace Motion.Shows.Rendering;

/// <summary>
/// Renders the show once it is packaged: drives the engine's offline renderer and records
/// the finished MP4. The video is a file on disk, served by the editor at /renders/...
/// </summary>
/// <param name="renderer">The video renderer.</param>
/// <param name="artifactStore">The artifact store.</param>
public sealed class ShowRenderReactor(
    IVideoRenderer renderer,
    ShowArtifactStore artifactStore) : IReactor
{
    /// <summary>
    /// Renders when the package is ready.
    /// </summary>
    /// <param name="event">The packaging completion.</param>
    /// <param name="context">The event context.</param>
    /// <returns>The render completion.</returns>
    public Task<IEnumerable<object>> On(ShowPackaged @event, EventContext context) =>
        PipelineStage.Run(context, "rendering", async () =>
        {
            var video = await Render(ShowId.From(context.EventSourceId), @event.PackageDirectory);
            return new RenderCompleted(video.RelativePath, video.DurationSeconds, video.SizeBytes);
        });

    /// <summary>
    /// Re-renders when the user asks for it.
    /// </summary>
    /// <param name="event">The request.</param>
    /// <param name="context">The event context.</param>
    /// <returns>The render completion.</returns>
    public Task<IEnumerable<object>> On(RenderRequested @event, EventContext context) =>
        PipelineStage.Run(context, "rendering", async () =>
        {
            var showId = ShowId.From(context.EventSourceId);
            var packageDirectory = artifactStore.PackageDirectory(showId);
            if (!Directory.Exists(packageDirectory))
            {
                throw new RenderFailed("The show has no package — package it first.");
            }
            var video = await Render(showId, packageDirectory);
            return new RenderCompleted(video.RelativePath, video.DurationSeconds, video.SizeBytes);
        });

    async Task<(string RelativePath, double DurationSeconds, long SizeBytes)> Render(ShowId showId, string packageDirectory)
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
        return (Path.GetRelativePath(artifactStore.FolderFor(showId), videoPath), duration, size);
    }
}
