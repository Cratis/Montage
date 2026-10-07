// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Observation;
using Motion.AI;
using Motion.Shows.Production;
using Motion.Shows.Timing;
using Motion.Speech;

namespace Motion.Shows.Packaging;

/// <summary>
/// Packages the show once it is timed: builds the engine spec (show.json) from the plan and
/// the word timings, assembles the package folder and zips it. The ZIP is the durable
/// artifact a render (or any other motion-engine tooling) consumes.
/// </summary>
/// <param name="packager">The packager.</param>
/// <param name="artifactStore">The artifact store.</param>
/// <param name="stages">The stage executor.</param>
public sealed class ShowPackagingReactor(
    IShowPackager packager,
    ShowArtifactStore artifactStore,
    PipelineStageExecutor stages) : IReactor
{
    /// <summary>
    /// Packages the show when timing is done.
    /// </summary>
    /// <param name="event">The timing completion.</param>
    /// <param name="context">The event context.</param>
    /// <returns>The packaging completion.</returns>
    public Task On(ShowTimed @event, EventContext context)
    {
        stages.Begin(context, "packaging", () => Package(ShowId.From(context.EventSourceId)));
        return Task.CompletedTask;
    }

    /// <summary>
    /// Re-packages when the user asks for it.
    /// </summary>
    /// <param name="event">The request.</param>
    /// <param name="context">The event context.</param>
    /// <returns>A completed task.</returns>
    public Task On(ShowPackagingRequested @event, EventContext context)
    {
        stages.Begin(context, "packaging", async () =>
        {
            var showId = ShowId.From(context.EventSourceId);
            if (ShowArtifactStore.ReadTextOrNull(artifactStore.LyricsJson(showId)) is null)
            {
                throw new SpeechTranscriptionFailed("The show has no timing yet — time it first.");
            }
            return await Package(showId);
        });
        return Task.CompletedTask;
    }
    Task<ShowPackaged> Package(ShowId showId)
    {
        var planJson = ShowArtifactStore.ReadTextOrNull(artifactStore.PlanJson(showId))
            ?? throw new ShowPlanningFailed("The show has no plan — plan it first.");
        var plan = ShowPlanner.Deserialize(planJson) ?? throw new ShowPlanningFailed("The stored plan could not be read.");
        var lyricsJson = ShowArtifactStore.ReadTextOrNull(artifactStore.LyricsJson(showId))
            ?? throw new SpeechTranscriptionFailed("The show has no timing — time it first.");
        var audioAnalysisJson = ShowArtifactStore.ReadTextOrNull(artifactStore.AudioAnalysisJson(showId)) ?? "{}";

        var voiceoverWav = artifactStore.VoiceoverWav(showId);
        if (!File.Exists(voiceoverWav)) throw new SpeechSynthesisFailed("The voiceover is missing — synthesize it first.");
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

        return Task.FromResult(new ShowPackaged(packageDirectory, packageZip));
    }
}
