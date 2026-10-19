// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Reactive.Subjects;
using Cratis.Arc.MongoDB;
using Cratis.Chronicle;
using MongoDB.Driver;
using Montage.Jobs;

namespace Montage.Shows.Production;

/// <summary>
/// One durable job in the production pipeline - what the editor's activity view watches to see
/// what the system is doing right now, and what went wrong when something did not finish.
/// </summary>
/// <param name="JobId">The identity of the job.</param>
/// <param name="Type">The job type (the grain type name).</param>
/// <param name="Details">The human description of what the job does.</param>
/// <param name="Status">The job's status (Preparing, Running, Completed, Failed, Stopped...).</param>
/// <param name="Created">When the job was started.</param>
/// <param name="ShowId">The identity of the show the job works on, when it works on a show.</param>
/// <param name="Error">Why the job failed, when it failed.</param>
/// <param name="IsRunning">Whether the job is preparing or running.</param>
[ReadModel]
public record JobActivity(
    string JobId,
    string Type,
    string Details,
    string Status,
    DateTimeOffset Created,
    string ShowId,
    string Error,
    bool IsRunning)
{
    /// <summary>
    /// Observes every job in the pipeline, polling the job manager - job state lives in Orleans
    /// rather than a watched MongoDB collection, and a pipeline job runs for minutes, so a poll
    /// cadence well under human impatience is all the liveness the activity view needs.
    /// </summary>
    /// <param name="jobs">The jobs manager accessor.</param>
    /// <param name="timeProvider">The <see cref="TimeProvider"/> for the poll cadence.</param>
    /// <returns>Observable of the job list, live.</returns>
    public static ISubject<IEnumerable<JobActivity>> All(
        IJobsManagerAccessor jobs,
        TimeProvider timeProvider) =>
        new PollingSubject(() => From(jobs), timeProvider);

    /// <summary>
    /// Reads every job from the jobs manager.
    /// </summary>
    /// <param name="jobs">The jobs manager accessor.</param>
    /// <returns>The current jobs, newest first.</returns>
    public static async Task<IEnumerable<JobActivity>> From(IJobsManagerAccessor jobs)
    {
        var manager = jobs.ForDefault();
        var all = await manager.GetAllJobs();

        return [.. all
            .Select(job => job.ToActivity())
            .OrderByDescending(job => job.Created)];
    }

    /// <summary>
    /// Emits a fresh job list on a fixed cadence while anyone is watching, skipping emissions when
    /// nothing changed so an idle pipeline stays quiet.
    /// </summary>
    sealed class PollingSubject(Func<Task<IEnumerable<JobActivity>>> compute, TimeProvider timeProvider) : ISubject<IEnumerable<JobActivity>>
    {
        static readonly TimeSpan _interval = TimeSpan.FromSeconds(1.5);
        readonly List<IObserver<IEnumerable<JobActivity>>> _observers = [];
        readonly Lock _lock = new();
        int _started;
        string _lastEmitted = string.Empty;

        public IDisposable Subscribe(IObserver<IEnumerable<JobActivity>> observer)
        {
            lock (_lock) _observers.Add(observer);
            if (Interlocked.Exchange(ref _started, 1) == 0) _ = PollForever();
            return new Unsubscriber(this, observer);
        }

        public void OnCompleted() => Complete();
        public void OnError(Exception error) => Complete();
        public void OnNext(IEnumerable<JobActivity> value) => Emit(value);

        async Task PollForever()
        {
            while (true)
            {
                try
                {
                    Emit(await compute());
                }
                catch
                {
                    // the jobs manager grain may not be reachable for a moment during silo startup;
                    // the next tick tries again
                }

                await Task.Delay(_interval, timeProvider);
            }
        }

        void Emit(IEnumerable<JobActivity> items)
        {
            var serialized = System.Text.Json.JsonSerializer.Serialize(items);
            if (serialized == _lastEmitted) return;
            _lastEmitted = serialized;

            foreach (var observer in Snapshot()) observer.OnNext(items);
        }

        void Complete()
        {
            foreach (var observer in Snapshot()) observer.OnCompleted();
        }

        IObserver<IEnumerable<JobActivity>>[] Snapshot()
        {
            lock (_lock) return [.. _observers];
        }

        sealed class Unsubscriber(PollingSubject subject, IObserver<IEnumerable<JobActivity>> observer) : IDisposable
        {
            public void Dispose()
            {
                lock (subject._lock) subject._observers.Remove(observer);
            }
        }
    }
}
