// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Events;

namespace Montage.Shows.Rendering;

/// <summary>
/// Occurs when a render of the show has completed and the MP4 is on disk.
/// </summary>
/// <param name="VideoPath">Path of the MP4, relative to the show folder.</param>
/// <param name="DurationSeconds">Duration of the rendered video.</param>
/// <param name="SizeBytes">Size of the MP4 file.</param>
[EventType]
public record RenderCompleted(string VideoPath, double DurationSeconds, long SizeBytes);

/// <summary>
/// Occurs when the user asks for the show to be rendered.
/// </summary>
[EventType]
public record RenderRequested();
