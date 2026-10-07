// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Text.Json;

using Cratis.Chronicle.Observation;
using Motion.AI;
using Motion.Shows.Production;
using Motion.Shows.Voiceover;
using Motion.Speech;

namespace Motion.Shows.Timing;

/// <summary>
/// Times the show: transcribes the voiceover with word-level timestamps and turns them into
/// the engine's lyrics document (data/lyrics.json), plus the loudness envelope the scenes
/// react to (data/audio.json). When no transcription service is configured, word times fall
/// back to a proportional spread across each scene's measured audio window — rougher, but
/// the video still works.
/// </summary>
/// <param name="transcriber">The speech-to-text client.</param>
/// <param name="artifactStore">The artifact store.</param>
/// <param name="stages">The stage executor (transcription runs long; the reactor acks immediately).</param>
public sealed class ShowTimingReactor(
    ISpeechTranscriber transcriber,
    ShowArtifactStore artifactStore,
    PipelineStageExecutor stages) : IReactor
{
    /// <summary>
    /// Times the show when the voiceover has been synthesized.
    /// </summary>
    /// <param name="event">The voiceover completion.</param>
    /// <param name="context">The event context.</param>
    /// <returns>The timing completion.</returns>
    public Task On(VoiceoverSynthesized @event, EventContext context)
    {
        stages.Begin(context, "timing", async () =>
        {
            var lyricsJson = await Time(ShowId.From(context.EventSourceId), @event.DurationSeconds);
            return new ShowTimed(lyricsJson);
        });
        return Task.CompletedTask;
    }

    /// <summary>
    /// Re-times when the user asks for it.
    /// </summary>
    /// <param name="event">The request.</param>
    /// <param name="context">The event context.</param>
    /// <returns>The timing completion.</returns>
    public Task On(ShowTimingRequested @event, EventContext context)
    {
        stages.Begin(context, "timing", async () =>
        {
            var showId = ShowId.From(context.EventSourceId);
            var duration = Wav.ReadDuration(artifactStore.VoiceoverWav(showId));
            var lyricsJson = await Time(showId, duration);
            return new ShowTimed(lyricsJson);
        });
        return Task.CompletedTask;
    }

    async Task<string> Time(ShowId showId, double audioDuration)
    {
        var planJson = ShowArtifactStore.ReadTextOrNull(artifactStore.PlanJson(showId))
            ?? throw new ShowPlanningFailed("The show has no plan — plan it first.");
        var plan = ShowPlanner.Deserialize(planJson) ?? throw new ShowPlanningFailed("The stored plan could not be read.");
        var wavPath = artifactStore.VoiceoverWav(showId);
        if (!File.Exists(wavPath)) throw new SpeechTranscriptionFailed("The voiceover WAV is missing — synthesize the voice first.");

        // collect the lyric lines: one per sentence, tagged with the positional scene id
        var lines = new List<(string SceneId, string Text, double WindowStart, double WindowEnd)>();
        double windowStart = 0;
        const double SceneGap = 0.45;
        for (var i = 0; i < plan.Scenes.Count; i++)
        {
            var spoken = plan.Scenes[i].Spoken.Trim();
            if (spoken.Length == 0) continue;
            foreach (var sentence in ShowTimingData.SplitIntoLines(spoken))
            {
                lines.Add(($"scene-{i + 1}", sentence, windowStart, windowStart + EstimateDuration(sentence)));
            }
            windowStart += EstimateDuration(spoken) + SceneGap;
        }

        var words = transcriber.IsEnabled
            ? await transcriber.TranscribeWithWordTimings(wavPath, CancellationToken.None)
            : [];

        var lyricsJson = ShowTimingData.BuildLyricsJson(lines, words, audioDuration);
        ShowArtifactStore.WriteText(artifactStore.LyricsJson(showId), lyricsJson);
        var audioAnalysisJson = ShowTimingData.BuildAudioAnalysisJson(wavPath, lyricsJson);
        ShowArtifactStore.WriteText(artifactStore.AudioAnalysisJson(showId), audioAnalysisJson);

        return lyricsJson;
    }

    static double EstimateDuration(string text)
    {
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
        return Math.Max(0.6, words * 0.34);
    }
}
