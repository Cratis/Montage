// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Seeding;
using Motion.AI;
using Motion.Shows.Creation;
using Motion.Shows.Planning;

#if DEBUG
namespace Motion.Shows.Demos;

/// <summary>
/// Seeds the two demo shows into a fresh event store: each is created and planned, and from
/// there the real pipeline takes over — the voice is synthesized by the configured TTS, the
/// words are aligned by the configured STT, the package is written and the engine renders
/// the video. No language model is needed to watch the system work end to end.
/// </summary>
/// <remarks>
/// Seeding is idempotent: on a store that already has these events, the entries are skipped,
/// so restarts never duplicate a demo.
/// </remarks>
/// <param name="artifactStore">The artifact store, where the plans live on disk.</param>
public sealed class DemoShowSeeding(ShowArtifactStore artifactStore) : ICanSeedEvents
{
    /// <summary>
    /// Seeds the demos. Each show arrives as a creation request; the plan itself is written to
    /// disk beforehand, so the planning stage adopts it (no language model needed) and emits
    /// the one ShowPlanned that kicks off the real pipeline: voice, timing, package, render.
    /// </summary>
    /// <param name="builder">The seeding builder.</param>
    public void Seed(IEventSeedingBuilder builder)
    {
        foreach (var demo in DemoShows.All)
        {
            DemoAssets.Write(artifactStore, ShowId.From(demo.Id));
            ShowArtifactStore.WriteText(artifactStore.PlanJson(ShowId.From(demo.Id)), ShowPlanner.Serialize(demo.Plan));
            builder.ForEventSource(
                demo.Id,
                [new ShowCreated(demo.Title, demo.Description, demo.Voice, demo.TargetDurationSeconds, demo.Tone, demo.Audience)]);
        }
    }
}
#endif
