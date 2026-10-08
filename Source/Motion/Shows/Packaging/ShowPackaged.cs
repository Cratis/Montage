// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Events;

namespace Motion.Shows.Packaging;

/// <summary>
/// Occurs when the show package (spec + audio + timing data) has been written and zipped.
/// </summary>
/// <param name="PackageDirectory">Unpacked package directory, relative to the show folder.</param>
/// <param name="PackageZip">Path of the zip, relative to the show folder.</param>
/// <param name="Render">True when the packaged show should go on to render video.</param>
[EventType]
public record ShowPackaged(string PackageDirectory, string PackageZip, bool Render = true);

/// <summary>
/// Occurs when the user asks for the package to be rebuilt.
/// </summary>
[EventType]
public record ShowPackagingRequested();
