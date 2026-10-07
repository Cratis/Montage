// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.EventSequences;
using Cratis.Chronicle.Observation;
using Motion.AI;
using Motion.Speech;
using Motion.Shows.Production;
using Motion.Shows.Timing;

namespace Motion.Shows.Packaging;

/// <summary>
/// Packages the show once it is timed: builds the engine spec (show.json) from the plan and
/// the word timings, assembles the package folder and zips it. The ZIP is the durable
/// artifact a render (or any other motion-engine tooling) consumes.
/// </summary>
/// <param name="packager">The packager.</param>
/// <param name="eventLog">The event log.</param>
/// <param name="artifactStore">The artifact store.</param>
/// <param name="logger">The logger.</param>
public sealed class ShowPackagingReactor(
    IShowPackager packager,
    IEventLog eventLog,
    ShowArtifactStore artifactStore,
    ILogger<ShowPackagingReactor> logger) : IReactor
{
    /// <summary>
    /// Packages the show when timing is done.
    /// </summary>
    /// <param name="event">The timing completion.</param>
    /// <param name="context">The event context.</param>
    /// <returns>A completed task.</returns>
    public Task On(ShowTimed @event, EventContext context) =>
        PipelineStage.Run(eventLog, context, "packaging", () => Package(ShowId.From(context.EventSourceId)));

    /// <summary>
    /// Re-packages when the user asks for it.
    /// </summary>
    /// <param name="event">The request.</param>
    /// <param name="context">The event context.</param>
    /// <returns>A completed task.</returns>
    public Task On(ShowPackagingRequested @event, EventContext context) =>
        PipelineStage.Run(eventLog, context, "packaging", () =>
        {
            var showId = ShowId.From(context.EventSourceId);
            var lyrics = ShowArtifactStore.ReadTextOrNull(artifactStore.LyricsJson(showId))
                ?? throw new InvalidOperationException("The show has no timing yet — time it first.");
            return Package(showId);
        });

    async Task Package(ShowId showId)
    {
        var planJson = ShowArtifactStore.ReadTextOrNull(artifactStore.PlanJson(showId))
            ?? throw new InvalidOperationException("The show has no plan — plan it first.");
        var plan = ShowPlanner.Deserialize(planJson) ?? throw new InvalidOperationException("The stored plan could not be read.");
        var lyricsJson = ShowArtifactStore.ReadTextOrNull(artifactStore.LyricsJson(showId))
            ?? throw new InvalidOperationException("The show has no timing — time it first.");
        var audioAnalysisJson = ShowArtifactStore.ReadTextOrNull(artifactStore.AudioAnalysisJson(showId)) ?? "{}";

        var voiceoverWav = artifactStore.VoiceoverWav(showId);
        if (!File.Exists(voiceoverWav)) throw new InvalidOperationException("The voiceover is missing — synthesize it first.");
        var audioDuration = Wav.ReadDuration(voiceoverWav);

        // pick the packaged audio: mp3 when it exists, wav otherwise
        var mp3 = artifactStore.VoiceoverAudio(showId);
        var voiceoverSource = File.Exists(mp3) ? mp3 : voiceoverWav;

        var windows = ShowSpecWriter.DeriveWindows(plan, lyricsJson, audioDuration);
        var spec = ShowSpecWriter.Build(showId.Value, plan, windows, audioDuration);
        var specJson = ShowSpecWriter.Serialize(spec);

        var packageDirectory = packager.WritePackageDirectory(showId, plan.Title, specJson, lyricsJson, audioAnalysisJson, voiceoverSource);
        var packageZip = artifactStore.PackageZip(showId);
        packager.Zip(packageDirectory, packageZip);

        await eventLog.Append(showId, new ShowPackaged(
            packageDirectory,
            packageZip));
    }
}
