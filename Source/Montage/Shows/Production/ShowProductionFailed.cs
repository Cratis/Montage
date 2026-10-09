// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Events;

namespace Montage.Shows.Production;

/// <summary>
/// Occurs when a production stage failed. The show stays where it is; the user can retry the stage.
/// </summary>
/// <param name="Stage">Which stage failed (planning, voiceover, timing, packaging, rendering).</param>
/// <param name="Reason">What went wrong, in one or two readable sentences.</param>
[EventType]
public record ShowProductionFailed(string Stage, string Reason);
