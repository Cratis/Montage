// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Arc.MongoDB;
using Cratis.Chronicle.Projections;
using MongoDB.Driver;
using Motion.Shows.Creation;
using Motion.Shows.Packaging;
using Motion.Shows.Planning;
using Motion.Shows.Production;
using Motion.Shows.Rendering;
using Motion.Shows.Timing;
using Motion.Shows.Voiceover;

namespace Motion.Shows.Listing;

/// <summary>
/// Represents a show in the listing — everything the editor needs at a glance and on the detail page.
/// </summary>
[ReadModel]
public record Show(
    ShowId Id,
    string Title,
    string Description,
    string Voice,
    double TargetDurationSeconds,
    string Tone,
    string Audience,
    string Status,
    string Stage,
    string Error,
    string PlannedTitle,
    string PlanJson,
    string AudioPath,
    double AudioDurationSeconds,
    string LyricsJson,
    string PackageDirectory,
    string PackageZip,
    string VideoPath,
    double VideoDurationSeconds,
    long VideoSizeBytes)
{
    /// <summary>
    /// Observes all shows so the editor updates live as production progresses.
    /// </summary>
    /// <param name="collection">The MongoDB collection.</param>
    /// <returns>Observable of the full list.</returns>
    public static ISubject<IEnumerable<Show>> ObserveAll(IMongoCollection<Show> collection) => collection.Observe();
}

/// <summary>
/// Builds the show listing from the production events; each event moves the show forward or records where it stopped.
/// </summary>
public class ShowProjection : IProjectionFor<Show>
{
    /// <inheritdoc/>
    public void Define(IProjectionBuilderFor<Show> builder) => builder
        .AutoMap()
        .WithInitialValues(() => new Show(
            Id: default!,
            Title: string.Empty,
            Description: string.Empty,
            Voice: string.Empty,
            TargetDurationSeconds: 60,
            Tone: string.Empty,
            Audience: string.Empty,
            Status: "Created",
            Stage: string.Empty,
            Error: string.Empty,
            PlannedTitle: string.Empty,
            PlanJson: string.Empty,
            AudioPath: string.Empty,
            AudioDurationSeconds: 0,
            LyricsJson: string.Empty,
            PackageDirectory: string.Empty,
            PackageZip: string.Empty,
            VideoPath: string.Empty,
            VideoDurationSeconds: 0,
            VideoSizeBytes: 0))
        .From<ShowCreated>()
        .From<ShowPlanningRequested>(_ => _
            .Set(x => x.Status).ToValue("Planning"))
        .From<ShowPlanned>(_ => _
            .Set(x => x.Status).ToValue("Planned")
            .Set(x => x.PlannedTitle).To(e => e.Title)
            .Set(x => x.Error).ToValue(string.Empty))
        .From<VoiceoverSynthesisRequested>(_ => _
            .Set(x => x.Status).ToValue("Voicing"))
        .From<VoiceoverSynthesized>(_ => _
            .Set(x => x.Status).ToValue("Voiced")
            .Set(x => x.Error).ToValue(string.Empty))
        .From<ShowTimingRequested>(_ => _
            .Set(x => x.Status).ToValue("Timing"))
        .From<ShowTimed>(_ => _
            .Set(x => x.Status).ToValue("Timed")
            .Set(x => x.Error).ToValue(string.Empty))
        .From<ShowPackagingRequested>(_ => _
            .Set(x => x.Status).ToValue("Packaging"))
        .From<ShowPackaged>(_ => _
            .Set(x => x.Status).ToValue("Packaged")
            .Set(x => x.Error).ToValue(string.Empty))
        .From<RenderRequested>(_ => _
            .Set(x => x.Status).ToValue("Rendering"))
        .From<RenderCompleted>(_ => _
            .Set(x => x.Status).ToValue("Rendered")
            .Set(x => x.VideoDurationSeconds).To(e => e.DurationSeconds)
            .Set(x => x.VideoSizeBytes).To(e => e.SizeBytes)
            .Set(x => x.Error).ToValue(string.Empty))
        .From<ShowProductionFailed>(_ => _
            .Set(x => x.Status).ToValue("Failed")
            .Set(x => x.Stage).To(e => e.Stage)
            .Set(x => x.Error).To(e => e.Reason));
}
