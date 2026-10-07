// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Text.Json;
using Cratis.Chronicle.EventSequences;
using Cratis.Chronicle.Observation;
using Motion.AI;
using Motion.Speech;
using Motion.Shows.Packaging;
using Motion.Shows.Planning;
using Motion.Shows.Production;

namespace Motion.Shows.Voiceover;

/// <summary>
/// Speaks the planned show: synthesizes each scene's narration, joins the takes with a breath
/// of silence between scenes, writes the voiceover WAV (and MP3 when ffmpeg is present), and
/// records exact per-scene audio windows for the timing stage.
/// </summary>
/// <param name="synthesizer">The text-to-speech client.</param>
/// <param name="ffmpeg">ffmpeg, when present.</param>
/// <param name="eventLog">The event log.</param>
/// <param name="artifactStore">The artifact store.</param>
/// <param name="logger">The logger.</param>
public sealed class VoiceoverSynthesisReactor(
    ISpeechSynthesizer synthesizer,
    IFfmpeg ffmpeg,
    IEventLog eventLog,
    ShowArtifactStore artifactStore,
    ILogger<VoiceoverSynthesisReactor> logger) : IReactor
{
    const double SceneGapSeconds = 0.45;

    /// <summary>
    /// Synthesizes the voiceover when a plan has been made.
    /// </summary>
    /// <param name="event">The plan.</param>
    /// <param name="context">The event context.</param>
    /// <returns>A completed task.</returns>
    public Task On(ShowPlanned @event, EventContext context) =>
        PipelineStage.Run(eventLog, context, "voiceover", () => Synthesize(ShowId.From(context.EventSourceId), @event.PlanJson));

    /// <summary>
    /// Re-synthesizes when the user asks for it — the plan comes from disk.
    /// </summary>
    /// <param name="event">The request.</param>
    /// <param name="context">The event context.</param>
    /// <returns>A completed task.</returns>
    public Task On(VoiceoverSynthesisRequested @event, EventContext context) =>
        PipelineStage.Run(eventLog, context, "voiceover", () =>
            Synthesize(ShowId.From(context.EventSourceId), ShowArtifactStore.ReadTextOrNull(artifactStore.PlanJson(ShowId.From(context.EventSourceId)))
                ?? throw new ShowPlanningFailed("The show has no plan to speak — plan it first.")));

    async Task Synthesize(ShowId showId, string planJson)
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
            await synthesizer.SynthesizeToWav(spoken, take, CancellationToken.None);
            takePaths.Add(take);
            spokenScenes.Add((i, spoken));
        }
        if (takePaths.Count == 0) throw new SpeechSynthesisFailed("The plan has no spoken narration at all.");

        // assemble: 0.45s of air between scenes
        var finalWav = artifactStore.VoiceoverWav(showId);
        (int Channels, int SampleRate)? format = null;
        using (var target = WavWriter.Create(finalWav))
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
        var audioPath = ffmpeg.ConvertToMp3(finalWav, mp3) ? "voiceover.mp3" : "voiceover.wav";

        await eventLog.Append(showId, new VoiceoverSynthesized(audioPath, duration));
    }
}
