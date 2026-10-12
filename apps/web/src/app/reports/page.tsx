'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { CursorPage, PrivateReportSummary } from '@outsaid/contracts';
import { ApiError, getMyReports, reportError } from '../../lib/api-client';
export default function ReportsPage() {
  const router = useRouter();
  const [page, setPage] = useState<CursorPage<PrivateReportSummary> | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [previous, setPrevious] = useState<(string | undefined)[]>([]);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    getMyReports(cursor).then(value => { if (active) setPage(value); }).catch(error => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) router.replace('/login');
      else setError(reportError(error));
    });
    return () => { active = false; };
  }, [cursor, retry, router]);
  function navigate(next: string | undefined) { setPage(null); setError(''); setCursor(next); }
  return <main className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
    <Link href="/account" className="text-sm text-teal-900 underline">Your account</Link>
    <div className="mt-8 flex flex-wrap items-center justify-between gap-5"><h1 className="editorial text-4xl">My reports</h1>
      <Link href="/reports/new" className="rounded-md bg-teal-900 px-5 py-3 font-semibold text-white">New report</Link></div>
    <p className="mt-5 leading-7 text-stone-600">Private drafts and submissions. Submission awaits human moderation and does not mean verification or publication.</p>
    {!page && !error && <p role="status" className="mt-8">Loading reports…</p>}
    {error && <div className="mt-8"><p role="alert" className="text-red-800">{error}</p><button className="mt-3 underline" onClick={() => { setError(''); setRetry(value => value + 1); }}>Try again</button></div>}
    {page && <>
      {page.items.length === 0 && <p className="mt-10 rounded-lg border border-stone-300 p-6">{previous.length ? 'No more reports on this page.' : 'No reports yet. Create a private draft when you are ready.'}</p>}
      <ul className="mt-8 divide-y divide-stone-300">{page.items.map(report => <li key={report.id} className="py-6">
        <Link className="editorial break-words text-2xl text-teal-950 underline decoration-stone-300 underline-offset-4" href={`/reports/${report.id}`}>{report.headline}</Link>
        <p className="mt-3 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded bg-stone-200 px-2 py-1">Private · {report.publicationStatus.replaceAll('_', ' ').toLowerCase()}</span><span className="rounded bg-amber-100 px-2 py-1">{report.verificationStatus.replaceAll('_', ' ').toLowerCase()}</span></p>
        <p className="mt-3 text-sm text-stone-600">Created {new Date(report.createdAt).toLocaleDateString()} · Revision {report.version}</p>
      </li>)}</ul>
      <nav aria-label="Report pages" className="mt-8 flex gap-4">
        <button disabled={!previous.length} className="rounded border border-stone-400 px-4 py-3 disabled:opacity-50" onClick={() => { const next = previous.at(-1); setPrevious(items => items.slice(0, -1)); navigate(next); }}>Previous</button>
        <button disabled={!page.nextCursor} className="rounded border border-stone-400 px-4 py-3 disabled:opacity-50" onClick={() => { setPrevious(items => [...items, cursor]); navigate(page.nextCursor ?? undefined); }}>Next</button>
      </nav>
    </>}
  </main>;
}
