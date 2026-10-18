// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Orleans.Jobs;
using Cratis.Orleans.Storage.Jobs;

namespace Montage.Shows.Production;

/// <summary>
/// Converts the stored state of a durable job into the <see cref="JobActivity"/> the editor's activity view shows.
/// </summary>
/// <remarks>
/// Lives outside <see cref="JobActivity"/> because every static method on a read model is treated as a query.
/// </remarks>
static class JobStateExtensions
{
    /// <summary>
    /// Converts a job's stored state into a <see cref="JobActivity"/>.
    /// </summary>
    /// <param name="job">The stored job state.</param>
    /// <returns>The <see cref="JobActivity"/> for the job.</returns>
    public static JobActivity ToActivity(this JobState job)
    {
        var showId = string.Empty;
        try
        {
            showId = job.Request?.GetType().GetProperty("ShowId")?.GetValue(job.Request)?.ToString() ?? string.Empty;
        }
        catch
        {
            // a job without a ShowId on its request is still a job worth listing
        }

        var failure = job.StatusChanges.LastOrDefault(change => change.Status == JobStatus.Failed);
        var error = failure is null ? string.Empty : string.Join("; ", failure.ExceptionMessages);

        return new JobActivity(
            job.Id.ToString() ?? string.Empty,
            job.Type.ToString() ?? string.Empty,
            job.Details.ToString() ?? string.Empty,
            job.Status.ToString(),
            job.Created,
            showId,
            error,
            job.IsPreparingOrRunning);
    }
}
