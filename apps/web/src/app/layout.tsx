import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://outsaid.vercel.app'),
  title: 'Outsaid | Public interest. Independent voices.',
  description: 'An independent, community-powered newsroom taking shape in Delhi NCR. Evidence, context, and careful human review.',
  openGraph: { title: 'Outsaid', description: 'Public interest. Independent voices.', type: 'website', locale: 'en_IN' },
};
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
