// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

/** Client-side shape of the AI plan (the same JSON the backend stores in the plan event). */
export interface PlannedScene {
    type: string;
    spoken?: string;
    params?: Record<string, unknown>;
}

export interface ShowPlanData {
    title: string;
    scenes: PlannedScene[];
}

export class ShowPlan {
    static parse(json: string | undefined): ShowPlanData | null {
        if (!json) return null;
        try {
            const parsed = JSON.parse(json);
            if (!parsed || !Array.isArray(parsed.scenes)) return null;
            return parsed as ShowPlanData;
        } catch {
            return null;
        }
    }
}
