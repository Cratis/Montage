// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { CratisComponentsProvider } from '@cratis/components';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shows } from './pages/Shows';
import { ShowDetail } from './pages/ShowDetail';

export default function App() {
    return (
        <CratisComponentsProvider>
            <BrowserRouter>
                <Routes>
                    <Route path='/' element={<Shows />} />
                    <Route path='/shows/:id' element={<ShowDetail />} />
                    <Route path='*' element={<Navigate to='/' replace />} />
                </Routes>
            </BrowserRouter>
        </CratisComponentsProvider>
    );
}
