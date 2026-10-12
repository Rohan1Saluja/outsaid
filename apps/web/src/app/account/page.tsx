'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { CurrentUser } from '@outsaid/contracts';
import { ApiError, getMe, logout } from '../../lib/api-client';
export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    getMe().then(value => { if (active) { setUser(value); setError(''); } }).catch(error => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) router.replace('/login');
      else setError('Your account could not be loaded. Please try again.');
    });
    return () => { active = false; };
  }, [router, retry]);
  async function signOut() {
    setBusy(true); setError('');
    try { await logout(); router.replace('/login'); }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) router.replace('/login');
      else { setError('Sign-out failed. You may still be signed in. Please try again.'); setBusy(false); }
    }
  }
  return <main className="mx-auto max-w-xl px-6 py-16 sm:py-24">
    <Link href="/" className="wordmark text-3xl font-black tracking-tighter">outsaid<span className="text-teal-800">.</span></Link>
    <h1 className="editorial mt-12 text-4xl">Your account</h1>
    {!user && !error && <p role="status" className="mt-6">Loading your account…</p>}
    {user && <section className="mt-8 rounded-lg border border-stone-300 bg-white p-6">
      <h2 className="text-xl font-semibold">{user.displayName}</h2>
      <p className="mt-2 text-sm text-stone-600">Role: {user.role.toLowerCase()}</p>
      <p className="mt-6 leading-7 text-stone-600">Your drafts and submissions stay private until human review. Submission does not mean verification or publication.</p>
      <Link href="/reports" className="mt-6 block font-semibold text-teal-900 underline">My reports</Link>
      <Link href="/reports/new" className="mt-3 block text-teal-900 underline">Create a private report</Link>
      <button onClick={signOut} disabled={busy} className="mt-6 rounded-md bg-teal-900 px-5 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-60">{busy ? 'Signing out…' : 'Sign out'}</button>
    </section>}
    {error && <div className="mt-6"><p role="alert" className="text-red-800">{error}</p>
      {!user && <button className="mt-3 underline" onClick={() => { setError(''); setRetry(value => value + 1); }}>Try again</button>}</div>}
  </main>;
}
