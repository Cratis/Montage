// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.AspNetCore;
using Cratis.DependencyInjection;
using Cratis.Orleans.Jobs;
using Microsoft.Extensions.Options;
using Orleans;

namespace Motion.Jobs;

/// <summary>
/// Resolves the <see cref="IJobsManager"/> for Motion's event store.
/// </summary>
/// <remarks>
/// The engine itself - grain mechanics, storage, throttling, resuming after a restart - lives
/// entirely in <c>Cratis.Orleans.Jobs</c>. Motion has a single event store and a single namespace,
/// so the accessor is the one place that names the <c>Scope</c> (the Chronicle event store) a job's
/// steps append their events into - the same mapping
/// <see cref="Cratis.Chronicle.IChronicleClient.GetEventStore"/> targets from inside a step.
/// </remarks>
public interface IJobsManagerAccessor
{
    /// <summary>
    /// Gets the <see cref="IJobsManager"/> for the event store and namespace an observed event lives in.
    /// </summary>
    /// <param name="context">The <see cref="EventContext"/> of the event being reacted to.</param>
    /// <returns>The <see cref="IJobsManager"/>.</returns>
    IJobsManager For(EventContext context);

    /// <summary>
    /// Gets the <see cref="IJobsManager"/> for Motion's event store and its default namespace - for
    /// callers with no event in hand, like a query listing the current jobs.
    /// </summary>
    /// <returns>The <see cref="IJobsManager"/>.</returns>
    IJobsManager ForDefault();
}

/// <summary>
/// Represents an implementation of <see cref="IJobsManagerAccessor"/>.
/// </summary>
/// <param name="grainFactory">The <see cref="IGrainFactory"/> the <see cref="IJobsManager"/> comes from.</param>
/// <param name="chronicleOptions">Names the event store a job's steps append their own events into.</param>
[Singleton]
public class JobsManagerAccessor(
    IGrainFactory grainFactory,
    IOptions<ChronicleAspNetCoreOptions> chronicleOptions) : IJobsManagerAccessor
{
    /// <inheritdoc/>
    public IJobsManager For(EventContext context) =>
        grainFactory.GetJobsManager(context.EventStore, context.Namespace.Value);

    /// <inheritdoc/>
    public IJobsManager ForDefault() =>
        grainFactory.GetJobsManager(chronicleOptions.Value.EventStore, EventStoreNamespaceName.Default.Value);
}
