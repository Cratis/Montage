// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

export const stageFlow = [
    { status: 'Created', label: 'created', stage: undefined },
    { status: 'Planning', label: 'plan', stage: 'plan' },
    { status: 'Planned', label: 'planned', stage: undefined },
    { status: 'Voicing', label: 'voice', stage: 'voice' },
    { status: 'Voiced', label: 'voiced', stage: undefined },
    { status: 'Timing', label: 'time', stage: 'time' },
    { status: 'Timed', label: 'timed', stage: undefined },
    { status: 'Packaging', label: 'package', stage: 'package' },
    { status: 'Packaged', label: 'packaged', stage: undefined },
    { status: 'Rendering', label: 'render', stage: 'render' },
    { status: 'Rendered', label: 'rendered', stage: undefined },
] as const;

export const retryable = ['Failed', 'Planned', 'Voiced', 'Timed', 'Packaged', 'Rendered'];
