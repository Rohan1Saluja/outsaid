'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PrivateReport, ReportContent } from '@outsaid/contracts';
import { ReportForm } from '../../../components/report-form';
import { ApiError, editReport, getReport, reportError, submitReport } from '../../../lib/api-client';
export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<PrivateReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    getReport(id).then(value => { if (active) { setReport(value); setError(''); } }).catch(error => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) router.replace('/login');
      else setError(reportError(error));
    });
    return () => { active = false; };
  }, [id, retry, router]);
  function failed(error: unknown) {
    if (error instanceof ApiError && error.status === 401) router.replace('/login'); else setError(reportError(error));
  }
  async function save(content: ReportContent, changeSummary: string) {
    if (!report) return;
    setBusy(true); setError(''); setNotice('');
    try { setReport(await editReport(id, { ...content, changeSummary, expectedVersion: report.version })); setNotice('Revision saved. Your report remains private and unverified.'); }
    catch (error) { failed(error); } finally { setBusy(false); }
  }
  async function submit() {
    if (!report) return;
    setBusy(true); setError(''); setNotice('');
    try { setReport(await submitReport(id, report.version)); setNotice('Submitted for human moderation. Your report remains private and unverified.'); }
    catch (error) { failed(error); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
    <Link href="/reports" className="text-sm text-teal-900 underline">My reports</Link>
    <h1 className="editorial mt-8 break-words text-4xl">{report?.headline ?? 'Private report'}</h1>
    {!report && !error && <p role="status" className="mt-8">Loading report…</p>}
    {report && <p className="mt-4 flex flex-wrap gap-3 text-sm"><span>Private · {report.publicationStatus.replaceAll('_', ' ').toLowerCase()}</span><span>{report.verificationStatus.replaceAll('_', ' ').toLowerCase()}</span><span>Revision {report.version}</span></p>}
    {notice && <p role="status" className="mt-6 rounded-md bg-teal-50 p-4 text-teal-950">{notice}</p>}
    {error && <div className="mt-6"><p role="alert" className="text-red-800">{error}</p><button disabled={busy} className="mt-3 underline" onClick={() => {
      if (report && !window.confirm('Reload the saved report? Any unsaved changes will be discarded.')) return;
      setReport(null); setError(''); setRetry(value => value + 1);
    }}>Reload saved report</button></div>}
    {report?.publicationStatus === 'DRAFT' && <ReportForm key={report.version} initial={report} editing busy={busy} onSave={save} onSubmit={submit} />}
    {report && report.publicationStatus !== 'DRAFT' && <article className="mt-8 space-y-6">
      <p className="rounded-lg border border-stone-300 bg-white p-5 leading-7">This report is read-only in the pilot. Submission awaits human moderation; it does not mean verification, approval or publication.</p>
      <p className="text-sm font-semibold">Claim basis: {report.claimBasis.replaceAll('_', ' ').toLowerCase()}</p>
      {report.locality && <p className="text-sm">Broad locality: {report.locality}</p>}
      <p className="whitespace-pre-wrap break-words leading-8">{report.body}</p>
      <h2 className="editorial text-2xl">Private source references</h2>
      <ul className="space-y-5">{report.sources.map((source, i) => <li key={i} className="rounded-lg border border-stone-300 bg-white p-5">
        <h3 className="break-words font-semibold">{source.label}</h3><p className="mt-2 text-sm">{source.kind.toLowerCase()}</p>
        {source.url && /^https?:\/\//i.test(source.url) && <a className="mt-3 block break-all text-teal-900 underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.url}</a>}
        {source.notes && <p className="mt-3 whitespace-pre-wrap break-words leading-7">{source.notes}</p>}
      </li>)}</ul>
    </article>}
  </main>;
}
