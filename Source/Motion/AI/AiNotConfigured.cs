// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

namespace Motion.AI;

/// <summary>
/// The exception when no AI provider is configured or the configured one cannot be reached.
/// </summary>
/// <param name="message">What went wrong and what to do about it.</param>
/// <param name="inner">The underlying exception, when there is one.</param>
public class AiNotConfigured(string message, Exception? inner = default) : Exception(message, inner);
