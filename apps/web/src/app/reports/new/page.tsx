'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ReportContent } from '@outsaid/contracts';
import { ReportForm } from '../../../components/report-form';
import { ApiError, createReport, getMe, reportError } from '../../../lib/api-client';
export default function NewReportPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    getMe().then(() => { if (active) setReady(true); }).catch(error => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) router.replace('/login');
      else setError('Your session could not be checked. Please try again.');
    });
    return () => { active = false; };
  }, [router, retry]);
  async function save(content: ReportContent) {
    setBusy(true); setError('');
    try { const report = await createReport(content); router.replace(`/reports/${report.id}`); }
    catch (error) { if (error instanceof ApiError && error.status === 401) router.replace('/login'); else setError(reportError(error)); setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
    <Link href="/reports" className="text-sm text-teal-900 underline">My reports</Link>
    <h1 className="editorial mt-8 text-4xl">New private report</h1>
    {!ready && !error && <p role="status" className="mt-8">Checking your session…</p>}
    {error && <div className="mt-6"><p role="alert" className="text-red-800">{error}</p>{!ready && <button className="mt-3 underline" onClick={() => { setError(''); setRetry(value => value + 1); }}>Try again</button>}</div>}
    {ready && <ReportForm busy={busy} onSave={save} />}
  </main>;
}
