'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, login } from '../../lib/api-client';
export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      await login({ email: String(data.get('email')), password: String(data.get('password')) });
      router.replace('/account');
    } catch (error) {
      setError(error instanceof ApiError && error.status === 401 ? 'Invalid email or password.'
        : error instanceof ApiError && error.status === 429 ? 'Too many attempts. Please try again in 15 minutes.'
        : error instanceof ApiError && error.status === 400 ? 'Please check your email and password.'
        : 'Sign-in is temporarily unavailable. Please try again.');
      setBusy(false);
    }
  }
  return <main className="mx-auto max-w-md px-6 py-16 sm:py-24">
    <Link href="/" className="wordmark text-3xl font-black tracking-tighter">outsaid<span className="text-teal-800">.</span></Link>
    <p className="mt-12 text-xs font-bold uppercase tracking-widest text-teal-800">Pilot access</p>
    <h1 className="editorial mt-3 text-4xl">Welcome back.</h1>
    <p className="mt-4 leading-7 text-stone-600">Sign in with the account provided by the Outsaid team. Public registration is not open yet.</p>
    <form onSubmit={submit} className="mt-8 space-y-5" aria-busy={busy}>
      <div><label htmlFor="email" className="block text-sm font-semibold">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} disabled={busy} className="mt-2 w-full rounded-md border border-stone-400 bg-white p-3 focus-visible:outline-2 focus-visible:outline-teal-800" /></div>
      <div><label htmlFor="password" className="block text-sm font-semibold">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} disabled={busy} className="mt-2 w-full rounded-md border border-stone-400 bg-white p-3 focus-visible:outline-2 focus-visible:outline-teal-800" /></div>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <button disabled={busy} className="w-full rounded-md bg-teal-900 p-3 font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <p className="mt-8 text-sm text-stone-600">Need access or help with your account? Contact your pilot coordinator.</p>
  </main>;
}
