// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.EventSequences;
using Cratis.Concepts;

namespace Montage.Shows;

/// <summary>
/// Identifies a show.
/// </summary>
public record ShowId(Guid Value) : ConceptAs<Guid>(Value)
{
    public static implicit operator Guid(ShowId id) => id.Value;
    public static implicit operator ShowId(Guid value) => new(value);
    public static implicit operator EventSourceId(ShowId id) => new(id.Value.ToString());

    public static ShowId New() => new(Guid.NewGuid());

    /// <summary>
    /// Converts an event source id (the show id as a string) back to a <see cref="ShowId"/>.
    /// </summary>
    /// <param name="eventSourceId">The event source id.</param>
    /// <returns>The show id.</returns>
    public static ShowId From(EventSourceId eventSourceId) => new(Guid.Parse(eventSourceId.Value));
}
