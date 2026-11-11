// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.


import { useEffect, useRef } from 'react';

/** Asks the browser to confirm leaving the page while there are unsaved edits. */
export function useUnloadGuard(dirty: boolean) {
    const dirtyRef = useRef(false);
    dirtyRef.current = dirty;
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (!dirtyRef.current) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, []);
}
