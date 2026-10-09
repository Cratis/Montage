// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.AI.Abstractions;
using CratisAIAgents = Cratis.AI.Agents;
using CratisAILanguageModels = Cratis.AI.LanguageModels;

namespace Montage.AI;

/// <summary>
/// Montage's <see cref="IAIAgents"/> - the seam <c>Cratis.AI</c>'s agent execution resolves an
/// agent's identity through, adapted onto Montage's single agent: the show planner.
/// </summary>
public class MontageAIAgents : IAIAgents
{
    /// <summary>
    /// Gets the purpose every show plan is generated under.
    /// </summary>
    public static readonly CratisAILanguageModels.LanguageModelPurpose PlanningPurpose = new("Planning");

    /// <summary>
    /// Gets the identity of Montage's planner agent.
    /// </summary>
    public static readonly CratisAIAgents.AgentId PlanningAgentId = CratisAIAgents.AgentId.For(PlanningPurpose);

    /// <inheritdoc/>
    public AgentDescriptor? Find(CratisAIAgents.AgentId id) => id == PlanningAgentId ? Descriptor() : null;

    /// <inheritdoc/>
    public AgentDescriptor? FindByPurpose(CratisAILanguageModels.LanguageModelPurpose purpose) =>
        purpose == PlanningPurpose ? Descriptor() : null;

    static AgentDescriptor Descriptor() => new(
        new CratisAIAgents.AgentId(PlanningAgentId.Value),
        new CratisAIAgents.AgentName("Planner"));
}
