'use client';
import { useEffect, useRef, useState } from 'react';
import type { ReportContent, SourceReference } from '@outsaid/contracts';
const blankSource = (): SourceReference => ({ kind: 'LINK', label: '', url: '', notes: '' });
const blankReport = (): ReportContent => ({ headline: '', body: '', locality: '', claimBasis: 'ALLEGATION', sources: [blankSource()] });
const field = 'mt-2 w-full rounded-md border border-stone-400 bg-white px-3 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800';
export function ReportForm({ initial, editing, busy, onSave, onSubmit }: {
  initial?: ReportContent; editing?: boolean; busy: boolean;
  onSave: (content: ReportContent, summary: string) => Promise<void>; onSubmit?: () => Promise<void>;
}) {
  const [value, setValue] = useState<ReportContent>(() => initial ? { headline: initial.headline, body: initial.body, locality: initial.locality, claimBasis: initial.claimBasis, sources: initial.sources } : blankReport());
  const [changeSummary, setChangeSummary] = useState('');
  const [dirty, setDirty] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const sequence = useRef(10);
  const [sourceKeys, setSourceKeys] = useState(() => (initial?.sources ?? [blankSource()]).map((_, i) => i));
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const beforeLink = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      if (link && link.target !== '_blank' && !window.confirm('Leave this page? Unsaved changes will be discarded.')) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', beforeLink, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', beforeLink, true); };
  }, [dirty]);
  function update(patch: Partial<ReportContent>) { setValue(current => ({ ...current, ...patch })); setDirty(true); }
  function source(index: number, patch: Partial<SourceReference>) {
    update({ sources: value.sources.map((item, i) => i === index ? { ...item, ...patch } : item) });
  }
  return <>
    <p className="mt-6 text-sm leading-6 text-stone-700">Drafts and submitted reports stay private. Describe allegations as claims, eyewitness accounts as what was directly observed, and documented information with its source and context. Documents can also contain unverified claims.</p>
    <p id="privacy-guidance" className="mt-3 text-sm leading-6 text-stone-700">Use broad locality only, such as a district or neighbourhood. Avoid addresses, coordinates, real-time locations and unnecessary witness names or contact details. Outsaid does not guarantee anonymity. Earlier saved versions and source descriptions remain in private revision history.</p>
    <p role="status" className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-950">{dirty ? 'Unsaved changes. ' : ''}Navigating away can discard unsaved changes. Report text is never saved in browser storage.</p>
    <form className="mt-8" onSubmit={event => {
      event.preventDefault();
      void onSave({ ...value, locality: value.locality?.trim() || null, sources: value.sources.map(item => ({ ...item, url: item.url?.trim() || null, notes: item.notes?.trim() || null })) }, changeSummary);
    }}>
      <fieldset disabled={busy} className="space-y-6 disabled:opacity-70">
        <label className="block font-semibold">Headline <span className="text-sm font-normal">(5–200 characters)</span>
          <input className={field} name="headline" required minLength={5} maxLength={200} value={value.headline} onChange={e => update({ headline: e.target.value })} />
        </label>
        <label className="block font-semibold">Claim basis
          <select className={field} name="claimBasis" value={value.claimBasis} onChange={e => update({ claimBasis: e.target.value as ReportContent['claimBasis'] })}>
            <option value="ALLEGATION">Allegation: an attributed claim</option><option value="EYEWITNESS_ACCOUNT">Eyewitness account: directly observed</option><option value="DOCUMENTED_INFORMATION">Documented information: attributed records</option>
          </select>
        </label>
        <label className="block font-semibold">Report <span className="text-sm font-normal">(20–20,000 characters)</span>
          <textarea className={field} rows={12} name="body" required minLength={20} maxLength={20000} value={value.body} onChange={e => update({ body: e.target.value })} />
        </label>
        <label className="block font-semibold">Broad locality <span className="text-sm font-normal">(optional, up to 120 characters)</span>
          <input className={field} name="locality" maxLength={120} aria-describedby="privacy-guidance" value={value.locality ?? ''} onChange={e => update({ locality: e.target.value })} />
        </label>
        <section aria-labelledby="sources-title">
          <h2 id="sources-title" className="editorial text-2xl">Source references</h2>
          <p className="mt-2 text-sm text-stone-600">Add 1–10 references. Links use http or https; we do not fetch them. No file uploads. Combined content and sources must fit within 64 KiB.</p>
          {value.sources.map((item, index) => <fieldset key={sourceKeys[index]} className="mt-5 space-y-4 rounded-lg border border-stone-300 bg-white p-4 sm:p-6">
            <legend className="px-2 font-semibold">Source {index + 1}</legend>
            <label className="block text-sm font-semibold">Reference type
              <select className={field} value={item.kind} onChange={e => source(index, { kind: e.target.value as SourceReference['kind'] })}>
                <option value="LINK">Link</option><option value="DOCUMENT">Document link</option><option value="EYEWITNESS">Eyewitness description</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">Source label <span className="font-normal">(5–200 characters)</span>
              <input className={field} required minLength={5} maxLength={200} value={item.label} onChange={e => source(index, { label: e.target.value })} />
            </label>
            <label className="block text-sm font-semibold">Reference URL <span className="font-normal">({item.kind === 'EYEWITNESS' ? 'optional' : 'required'}, up to 2,048 characters)</span>
              <input className={field} type="url" required={item.kind !== 'EYEWITNESS'} maxLength={2048} value={item.url ?? ''} placeholder="https://…" onChange={e => source(index, { url: e.target.value })} />
            </label>
            <label className="block text-sm font-semibold">{item.kind === 'EYEWITNESS' ? 'What was directly observed' : 'Source context'} <span className="font-normal">({item.kind === 'EYEWITNESS' ? 'required' : 'optional'}, 20–1,000 characters when provided)</span>
              <textarea className={field} rows={3} required={item.kind === 'EYEWITNESS'} minLength={20} maxLength={1000} aria-describedby="privacy-guidance" value={item.notes ?? ''} onChange={e => source(index, { notes: e.target.value })} />
            </label>
            <button type="button" className="rounded px-2 py-2 text-sm text-red-800 underline disabled:opacity-50" disabled={value.sources.length === 1} aria-label={`Remove source ${index + 1}`} onClick={() => {
              update({ sources: value.sources.filter((_, i) => i !== index) }); setSourceKeys(keys => keys.filter((_, i) => i !== index));
            }}>Remove source</button>
          </fieldset>)}
          <button type="button" disabled={value.sources.length >= 10} className="mt-4 rounded border border-teal-900 px-4 py-3 font-semibold text-teal-900 disabled:opacity-50" onClick={() => {
            update({ sources: [...value.sources, blankSource()] }); setSourceKeys(keys => [...keys, sequence.current++]);
          }}>Add source reference</button>
        </section>
        {editing && <label className="block font-semibold">Change summary <span className="text-sm font-normal">(5–500 characters)</span>
          <input className={field} required minLength={5} maxLength={500} value={changeSummary} onChange={e => { setChangeSummary(e.target.value); setDirty(true); }} />
        </label>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="rounded-md bg-teal-900 px-5 py-3 font-semibold text-white">{busy ? 'Saving…' : editing ? 'Save revision' : 'Create private draft'}</button>
          {onSubmit && <button type="button" disabled={dirty} onClick={() => dialog.current?.showModal()} className="rounded-md border border-teal-900 px-5 py-3 font-semibold text-teal-900 disabled:opacity-50">Submit for human review</button>}
        </div>
        {onSubmit && dirty && <p className="text-sm text-stone-700">Save your changes before submitting.</p>}
      </fieldset>
    </form>
    {onSubmit && <dialog ref={dialog} aria-labelledby="submit-heading" className="m-auto max-w-lg rounded-lg border border-stone-300 bg-white p-6 shadow-xl backdrop:bg-black/40">
      <h2 id="submit-heading" className="editorial text-2xl">Submit this saved revision?</h2>
      <p className="mt-4 leading-7">Your report will remain private and await human moderation. Submission does not mean verification, approval or publication. You cannot edit it after submitting in this pilot.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="rounded-md border border-stone-400 px-4 py-3" onClick={() => dialog.current?.close()}>Keep drafting</button>
        <button type="button" className="rounded-md bg-teal-900 px-4 py-3 font-semibold text-white" onClick={() => { dialog.current?.close(); void onSubmit(); }}>Confirm submission</button>
      </div>
    </dialog>}
  </>;
}
