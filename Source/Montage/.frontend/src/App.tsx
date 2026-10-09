// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { useState } from 'react';
import { CratisComponentsProvider } from '@cratis/components';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shows } from './pages/Shows';
import { ShowDetail } from './pages/ShowDetail';
import { SettingsDialog } from './pages/Settings';

export default function App() {
    const [settingsVisible, setSettingsVisible] = useState(false);

    return (
        <CratisComponentsProvider>
            <BrowserRouter>
                <button
                    className='fixed top-5 right-6 z-40 w-10 h-10 rounded-full panel panel-accent grid place-items-center hover:border-[rgba(255,255,255,0.25)] transition-colors cursor-pointer'
                    title='AI provider settings'
                    onClick={() => setSettingsVisible(true)}>
                    <i className='pi pi-cog text-[var(--cr-montage-dim)]' />
                </button>
                <Routes>
                    <Route path='/' element={<Shows />} />
                    {/* one show page with Overview and Storyboard tabs; the /storyboard
                        deep link (shows list, 'define slides') lands on the storyboard tab */}
                    <Route path='/shows/:id/*' element={<ShowDetail />} />
                    <Route path='*' element={<Navigate to='/' replace />} />
                </Routes>
                <SettingsDialog visible={settingsVisible} onHide={() => setSettingsVisible(false)} />
            </BrowserRouter>
        </CratisComponentsProvider>
    );
}
