// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Events;

namespace Motion.Shows.Planning;

/// <summary>
/// Occurs when the language model has planned the show: story, spoken script and the per-scene
/// visual specs. The whole plan travels as JSON — it is a data artifact, not a domain structure.
/// </summary>
/// <param name="Title">The title the planner chose.</param>
/// <param name="PlanJson">The plan: scenes with type, params and spoken text.</param>
[EventType]
public record ShowPlanned(string Title, string PlanJson);

/// <summary>
/// Occurs when the user asks for planning to run (first run or a regenerate).
/// </summary>
[EventType]
public record ShowPlanningRequested();
