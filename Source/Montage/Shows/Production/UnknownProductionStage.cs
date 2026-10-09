// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

namespace Montage.Shows.Production;

/// <summary>
/// Thrown when a stage-regeneration request names a stage the pipeline does not have.
/// </summary>
/// <param name="stage">The unknown stage name.</param>
public class UnknownProductionStage(string stage)
    : Exception($"Unknown stage '{stage}'. Use plan, voice, time, package or render.");
