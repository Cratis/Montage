// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { useState } from 'react';
import { Button } from '@cratis/components/Common';
import { Dialog } from '@cratis/components/Dialogs';
import {
    AIProvider,
    AIProviderType,
    AllAIProviders,
    AddOpenAICompatibleProvider,
    AddAnthropicProvider,
    RemoveAIProvider,
} from '@cratis/ai';

const typeLabel = (type: AIProviderType) =>
    type === AIProviderType.anthropic ? 'anthropic'
    : type === AIProviderType.openAI ? 'openai'
    : type === AIProviderType.azureOpenAI ? 'azure'
    : type === AIProviderType.openAICompatible ? 'openai-compatible'
    : type === AIProviderType.ZAI ? 'z.ai'
    : type === AIProviderType.openAICodex ? 'codex'
    : 'other';

/**
 * The settings dialog: the AI providers every plan is generated through. Adding a provider is
 * the whole configuration surface Motion needs - no pools, no tiers, just a name, an endpoint
 * and (when the endpoint wants one) an API key.
 */
export function SettingsDialog({ visible, onHide }: { visible: boolean; onHide: () => void }) {
    const [providers] = AllAIProviders.use();
    // the server requires maxConcurrentJobs - without it the add fails validation silently
    const [addOpenAI, setOpenAIValues, clearOpenAI] = AddOpenAICompatibleProvider.use({ maxConcurrentJobs: 4 });
    const [addAnthropic, setAnthropicValues, clearAnthropic] = AddAnthropicProvider.use({ maxConcurrentJobs: 4 });
    const [remove, setRemoveValues] = RemoveAIProvider.use();
    // the npm proxy routes removal without the command name; the server registers it with
    // - without this the remove button 405s silently
    (remove as unknown as { route: string }).route = '/api/a-i/providers/removing/remove-a-i-provider';
    const [kind, setKind] = useState<'openai-compatible' | 'anthropic'>('openai-compatible');
    const [busy, setBusy] = useState(false);
    const [addError, setAddError] = useState<string>('');

    const sorted = [...providers.data].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

    const add = async () => {
        setBusy(true);
        try {
            setAddError('');
            const result = kind === 'openai-compatible'
                ? await addOpenAI.execute()
                : await addAnthropic.execute();
            if (result.isSuccess) {
                if (kind === 'openai-compatible') clearOpenAI(); else clearAnthropic();
            } else {
                const problems = [
                    ...result.validationResults.map((v) => v.message),
                    ...result.exceptionMessages,
                ].filter((m) => !!m);
                setAddError(problems.length > 0 ? problems.join('; ') : 'The provider was not added.');
            }
        } catch (error) {
            setAddError(String((error as Error)?.message ?? error));
        } finally {
            setBusy(false);
        }
    };

    const removeProvider = async (id: string) => {
        setRemoveValues({ provider: id as never });
        await remove.execute();
    };

    const canAdd = kind === 'openai-compatible'
        ? (addOpenAI.name ?? '').trim().length > 0 && (addOpenAI.endpoint ?? '').trim().length > 0
        : (addAnthropic.name ?? '').trim().length > 0 && (addAnthropic.apiKey ?? '').trim().length > 0;

    return (
        <Dialog title='AI providers' visible={visible} onCancel={onHide} dismissable>
            <div className='flex flex-col gap-4 pt-2 min-w-[26rem]'>
                <div className='flex flex-col gap-2 max-h-56 overflow-y-auto'>
                    {sorted.length === 0 && (
                        <div className='panel p-4 text-sm text-[var(--cr-motion-dim)] text-center'>
                            No providers yet. Add one below — an OpenAI-compatible endpoint such as
                            Ollama on localhost:11434/v1 works.
                        </div>
                    )}
                    {sorted.map((provider: AIProvider) => (
                        <div key={provider.id.toString()} className='panel px-3 py-2.5 flex items-center justify-between gap-3'>
                            <div className='min-w-0'>
                                <div className='text-sm font-medium truncate'>{provider.name}</div>
                                <div className='mono text-[11px] text-[var(--cr-motion-faint)] truncate'>
                                    {typeLabel(provider.type)}{provider.endpoint ? ` · ${provider.endpoint}` : ''}
                                    {provider.hasUsageCredential ? ' · key set' : ''}
                                </div>
                                {provider.modelDiscoveryFailure && (
                                    <div className='text-[11px] text-[#e5484d] truncate'>models: {provider.modelDiscoveryFailure}</div>
                                )}
                            </div>
                            <Button
                                label=''
                                icon='pi pi-trash'
                                severity='danger'
                                text
                                onClick={() => removeProvider(provider.id.toString())} />
                        </div>
                    ))}
                </div>

                <div className='border-t border-[rgba(255,255,255,0.08)] pt-3 flex flex-col gap-3'>
                    <label className='eyebrow block'>Add a provider</label>
                    <div className='flex gap-2 text-xs mono'>
                        <button
                            className={`px-2.5 py-1 rounded-md border ${kind === 'openai-compatible' ? 'border-[var(--cr-motion-violet)] text-[var(--cr-motion-violet)]' : 'border-[rgba(255,255,255,0.12)] text-[var(--cr-motion-dim)]'}`}
                            onClick={() => setKind('openai-compatible')}>
                            openai-compatible
                        </button>
                        <button
                            className={`px-2.5 py-1 rounded-md border ${kind === 'anthropic' ? 'border-[var(--cr-motion-violet)] text-[var(--cr-motion-violet)]' : 'border-[rgba(255,255,255,0.12)] text-[var(--cr-motion-dim)]'}`}
                            onClick={() => setKind('anthropic')}>
                            anthropic
                        </button>
                    </div>
                    <input
                        className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent'
                        placeholder='Name — e.g. Ollama local'
                        value={kind === 'openai-compatible' ? addOpenAI.name ?? '' : addAnthropic.name ?? ''}
                        onChange={(e) => kind === 'openai-compatible'
                            ? setOpenAIValues({ name: e.target.value })
                            : setAnthropicValues({ name: e.target.value })} />
                    {kind === 'openai-compatible' ? (
                        <>
                            <input
                                className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent'
                                placeholder='Endpoint — e.g. http://localhost:11434/v1'
                                value={addOpenAI.endpoint ?? ''}
                                onChange={(e) => setOpenAIValues({ endpoint: e.target.value })} />
                            <input
                                className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent'
                                placeholder='API key (optional for local endpoints)'
                                type='password'
                                value={addOpenAI.apiKey ?? ''}
                                onChange={(e) => setOpenAIValues({ apiKey: e.target.value })} />
                        </>
                    ) : (
                        <input
                            className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent'
                            placeholder='API key'
                            type='password'
                            value={addAnthropic.apiKey ?? ''}
                            onChange={(e) => setAnthropicValues({ apiKey: e.target.value })} />
                    )}
                    <label className='block'>
                        <span className='eyebrow block mb-1.5'>Max concurrent jobs (0 = no limit)</span>
                        <input
                            className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent mono'
                            type='number'
                            min={0}
                            value={kind === 'openai-compatible' ? addOpenAI.maxConcurrentJobs ?? 4 : addAnthropic.maxConcurrentJobs ?? 4}
                            onChange={(e) => {
                                const value = Math.max(0, Number(e.target.value) || 0);
                                if (kind === 'openai-compatible') setOpenAIValues({ maxConcurrentJobs: value });
                                else setAnthropicValues({ maxConcurrentJobs: value });
                            }} />
                    </label>
                    {addError && (
                        <div className='text-xs text-[#e5484d]'>{addError}</div>
                    )}
                    <div className='flex justify-end'>
                        <Button
                            label='Add provider'
                            icon='pi pi-plus'
                            loading={busy}
                            disabled={!canAdd}
                            onClick={add} />
                    </div>
                </div>
            </div>
        </Dialog>
    );
}
