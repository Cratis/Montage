// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { useMemo, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import { ObserveAll } from '../../Api/Shows/Listing';
import { All as AllJobs, JobActivity } from '../../Api/Shows/Production';
import { ShowPlan } from '../plan';
import { StoryboardEditor } from './Storyboard';
import { OverviewTab } from './showDetail/OverviewTab';
import { ProductionActivity } from './showDetail/ProductionActivity';
import { ShowHeader } from './showDetail/ShowHeader';
import { StatusBadge } from './showDetail/StatusBadge';
import { TabBar } from './showDetail/TabBar';
import { useUnloadGuard } from './showDetail/useUnloadGuard';
import { stageFlow } from './showDetail/stageFlow';
import { UnsavedChangesDialog } from './showDetail/UnsavedChangesDialog';

export { stageFlow, StatusBadge };

type ExitDestination = 'overview' | 'back' | 'storyboard';

const exitPath = (dest: ExitDestination, id: string | undefined) => {
    if (dest === 'back') return '/';
    return dest === 'overview' ? `/shows/${id}` : `/shows/${id}/storyboard`;
};

/** Intercepts leaving while there are unsaved edits: returns true (and remembers where to) when it must ask first. */
function useExitConfirmation(unsaved: boolean) {
    const [pending, setPending] = useState<null | ExitDestination>(null);
    const confirm = (dest: ExitDestination) => {
        if (unsaved) setPending(dest);
        return unsaved;
    };
    return [pending, confirm, setPending] as const;
}

/** Both tabs stay mounted so unsaved edits survive; the inactive one is just hidden. */
function TabPane({ visible, children }: { visible: boolean; children: React.ReactNode }) {
    return <div style={visible ? undefined : { display: 'none' }}>{children}</div>;
}

export function ShowDetail() {
    const { id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const [shows] = ObserveAll.use();
    const [jobs] = AllJobs.use();
    const show = shows.data.find((s) => s.id.toString() === id);
    const plan = useMemo(() => ShowPlan.parse(show?.planJson), [show?.planJson]);
    const showJobs = jobs.data
        .filter((job: JobActivity) => job.showId === id)
        .sort((a: JobActivity, b: JobActivity) => new Date(b.created).getTime() - new Date(a.created).getTime());

    // one page, two tabs: production on the left of the slash, scene editing behind the deep
    // link the shows list and 'define slides' use — both stay mounted so unsaved edits survive
    const tab = location.pathname.endsWith('/storyboard') ? 'storyboard' : 'overview';
    const videoRef = useRef<HTMLVideoElement>(null);
    const switchTab = (next: 'overview' | 'storyboard') => {
        if (next === tab) return;
        if (confirmExit(next)) return;
        if (tab === 'overview') videoRef.current?.pause(); // a hidden player would keep sounding
        navigate(next === 'storyboard' ? `/shows/${id}/storyboard` : `/shows/${id}`);
    };

    // the storyboard editor owns scene state and the save logic; the header owns its buttons
    const saveRef = useRef<((produce: boolean) => void) | null>(null);
    const [busy, setBusy] = useState(false);
    const [saveError, setSaveError] = useState('');

    // unsaved scene edits: leaving the storyboard asks whether to discard or generate
    const [dirty, setDirty] = useState(false);
    const [pendingExit, confirmExit, setPendingExit] = useExitConfirmation(dirty && tab === 'storyboard');
    useUnloadGuard(dirty);

    if (!show) {
        return <ProductionActivity showJobs={showJobs} connecting={shows.data.length === 0} />;
    }

    return (
        <div className='min-h-screen max-w-6xl mx-auto px-8 py-10'>
            <div className='flex items-center gap-3 mb-2'>
                <Link
                    to='/'
                    className='mono text-xs text-[var(--cr-montage-faint)] hover:text-[var(--cr-montage-ink)]'
                    onClick={(e) => { if (confirmExit('back')) e.preventDefault(); }}>← shows</Link>
            </div>
            <ShowHeader show={show} title={plan?.title || show.title} busy={busy} onSave={(produce) => saveRef.current?.(produce)} />

            <TabBar tab={tab} onSwitch={switchTab} />

            {saveError && (
                <div className='panel p-4 mb-6 border-l-4' style={{ borderLeftColor: '#e5484d' }}>
                    <p className='text-sm text-[#e5484d]'>{saveError}</p>
                </div>
            )}

            <TabPane visible={tab === 'overview'}>
                <OverviewTab show={show} showJobs={showJobs} videoRef={videoRef} />
            </TabPane>

            <TabPane visible={tab === 'storyboard'}>
                <StoryboardEditor
                    show={show}
                    registerSave={(fn) => { saveRef.current = fn; }}
                    registerDirty={setDirty}
                    busy={busy}
                    setBusy={setBusy}
                    saveError={saveError}
                    setSaveError={setSaveError} />
            </TabPane>

            {pendingExit !== null && (
                <UnsavedChangesDialog
                    onDismiss={() => setPendingExit(null)}
                    onDiscard={() => {
                        const dest = pendingExit;
                        setPendingExit(null);
                        setDirty(false);
                        navigate(exitPath(dest, id));
                    }}
                    onGenerate={() => {
                        const produce = saveRef.current;
                        setPendingExit(null);
                        navigate(`/shows/${id}/storyboard`);
                        produce?.(true);
                    }} />
            )}
        </div>
    );
}


