// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Text.Json;
using Cratis.Chronicle.Observation;
using MongoDB.Driver;
using Motion.AI;
using Motion.Shows.Listing;
using Motion.Shows.Packaging;
using Motion.Shows.Planning;
using Motion.Shows.Production;
using Motion.Speech;

namespace Motion.Shows.Voiceover;

/// <summary>
/// Speaks the planned show: synthesizes each scene's narration, joins the takes with a breath
/// of silence between scenes, writes the voiceover WAV (and MP3 when ffmpeg is present), and
/// records exact per-scene audio windows for the timing stage.
/// </summary>
/// <param name="synthesizer">The text-to-speech client.</param>
/// <param name="ffmpeg">ffmpeg, when present.</param>
/// <param name="artifactStore">The artifact store.</param>
/// <param name="shows">The show listing collection (for the per-show voice).</param>
/// <param name="stages">The stage executor (synthesis runs minutes; the reactor acks immediately).</param>
public sealed class VoiceoverSynthesisReactor(
    ISpeechSynthesizer synthesizer,
    IFfmpeg ffmpeg,
    ShowArtifactStore artifactStore,
    IMongoCollection<Show> shows,
    PipelineStageExecutor stages) : IReactor
{
    const double SceneGapSeconds = 0.45;

    /// <summary>
    /// Synthesizes the voiceover when a plan has been made.
    /// </summary>
    /// <param name="event">The plan.</param>
    /// <param name="context">The event context.</param>
    /// <returns>The voiceover completion.</returns>
    public Task On(ShowPlanned @event, EventContext context)
    {
        stages.Begin(context, "voiceover", async () =>
        {
            var showId = ShowId.From(context.EventSourceId);
            var (audioPath, duration) = await Synthesize(showId, @event.PlanJson, await VoiceOf(showId));
            return new VoiceoverSynthesized(audioPath, duration);
        });
        return Task.CompletedTask;
    }

    /// <summary>
    /// Re-synthesizes when the user asks for it — the plan comes from disk.
    /// </summary>
    /// <param name="event">The request.</param>
    /// <param name="context">The event context.</param>
    /// <returns>The voiceover completion.</returns>
    public Task On(VoiceoverSynthesisRequested @event, EventContext context)
    {
        stages.Begin(context, "voiceover", async () =>
        {
            var showId = ShowId.From(context.EventSourceId);
            var planJson = ShowArtifactStore.ReadTextOrNull(artifactStore.PlanJson(showId))
                ?? throw new ShowPlanningFailed("The show has no plan to speak — plan it first.");
            var (audioPath, duration) = await Synthesize(showId, planJson, await VoiceOf(showId));
            return new VoiceoverSynthesized(audioPath, duration);
        });
        return Task.CompletedTask;
    }

    async Task<string> VoiceOf(ShowId showId)
    {
        // On a cold boot the read model can lag the kernel by a few seconds while the MongoDB
        // replica set finishes electing; retry rather than fail the stage on that race.
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                var show = await shows.Find(s => s.Id == showId).FirstOrDefaultAsync();
                return show?.Voice ?? string.Empty;
            }
            catch (Exception ex) when (attempt < 5 && ex.Message.Contains("timeout occurred", StringComparison.OrdinalIgnoreCase))
            {
                await Task.Delay(5000);
            }
        }
    }

    async Task<(string AudioPath, double Duration)> Synthesize(ShowId showId, string planJson, string voice)
    {
        if (!synthesizer.IsEnabled)
        {
            throw new SpeechSynthesisFailed(
                "No text-to-speech service is configured. Set Cratis:Motion:Tts in appsettings.local.json " +
                "(an OpenAI-compatible /v1/audio/speech endpoint, e.g. Kokoro-FastAPI on :8880).");
        }
        var plan = ShowPlanner.Deserialize(planJson) ?? throw new ShowPlanningFailed("The stored plan could not be read.");

        var takesFolder = Path.Combine(artifactStore.FolderFor(showId), "takes");
        if (Directory.Exists(takesFolder)) Directory.Delete(takesFolder, true);
        Directory.CreateDirectory(takesFolder);

        // synthesize one take per scene (scenes with no spoken text contribute only a gap)
        var spokenScenes = new List<(int Index, string Text)>();
        var takePaths = new List<string>();
        for (var i = 0; i < plan.Scenes.Count; i++)
        {
            var spoken = plan.Scenes[i].Spoken.Trim();
            if (spoken.Length == 0) continue;
            var take = Path.Combine(takesFolder, $"scene-{i + 1:00}.wav");
            await synthesizer.SynthesizeToWav(spoken, take, CancellationToken.None, voice);
            takePaths.Add(take);
            spokenScenes.Add((i, spoken));
        }
        if (takePaths.Count == 0) throw new SpeechSynthesisFailed("The plan has no spoken narration at all.");

        // assemble: 0.45s of air between scenes
        var finalWav = artifactStore.VoiceoverWav(showId);
        (int Channels, int SampleRate)? format = null;
        await using (var target = WavWriter.Create(finalWav))
        {
            for (var i = 0; i < takePaths.Count; i++)
            {
                if (i > 0) WavWriter.AppendSilence(target, format!.Value, SceneGapSeconds);
                WavWriter.Append(takePaths[i], target, ref format);
            }
            WavWriter.Finalize(target, format!.Value);
        }
        var duration = Wav.ReadDuration(finalWav);

        // mp3 for playback and packaging; wav when ffmpeg is missing (engine and renderer handle both)
        var mp3 = artifactStore.VoiceoverAudio(showId);
        return ffmpeg.ConvertToMp3(finalWav, mp3)
            ? ("voiceover.mp3", duration)
            : ("voiceover.wav", duration);
    }
}
