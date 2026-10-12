import Link from 'next/link';

const principles = [
  ['01', 'Evidence before amplification', 'Claims need context. We will distinguish allegations, eyewitness accounts, and corroborated facts.'],
  ['02', 'People at the centre', 'Public-interest reporting should inform communities while protecting contributors and vulnerable people.'],
  ['03', 'Independent by principle', 'The same editorial standards, whoever is in the story. Every report reviewed by a human before publication.'],
];
export default function Home() {
  return (
    <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-300 py-7">
        <Link href="/" aria-label="Outsaid home" className="wordmark text-4xl font-black tracking-tighter">outsaid<span className="text-teal-800">.</span></Link>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-600">Independent voices · Delhi NCR</span>
      </header>
      <main id="main">
        <section aria-labelledby="intro" className="grid gap-12 py-20 sm:py-28 lg:grid-cols-[1.6fr_1fr] lg:items-end">
          <div>
            <p className="mb-7 text-xs font-bold uppercase tracking-[0.22em] text-teal-800">A newsroom taking shape</p>
            <h1 id="intro" className="editorial max-w-3xl text-5xl leading-[1.05] tracking-tight sm:text-7xl lg:text-8xl">Public interest.<br /><span className="text-teal-800">Independent</span><br />voices.</h1>
          </div>
          <div className="max-w-md border-l-2 border-teal-800 pl-6 lg:mb-2">
            <p className="text-lg leading-relaxed text-stone-700">A space for stories that matter to our communities. Built around evidence, context, and careful human review.</p>
            <p className="mt-6 text-sm leading-relaxed text-stone-600">Starting with Delhi NCR. Outsaid is in development; reading and contribution features will open in a future release.</p>
            <a href="#principles" className="mt-7 inline-block font-semibold text-teal-900 underline decoration-teal-800/40 underline-offset-4 hover:decoration-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4">Our editorial principles <span aria-hidden="true">↗</span></a>
          </div>
        </section>
        <section id="principles" aria-labelledby="principles-heading" className="border-t border-stone-300 py-10 sm:py-14">
          <h2 id="principles-heading" className="mb-10 text-xs font-bold uppercase tracking-[0.2em] text-stone-600">What we stand for</h2>
          <div className="grid gap-10 md:grid-cols-3">
            {principles.map(([number, title, copy]) => (
              <article key={number}>
                <span className="text-sm font-semibold text-teal-800">{number}</span>
                <h3 className="editorial mt-4 text-2xl leading-tight">{title}</h3>
                <p className="mt-4 max-w-sm text-sm leading-7 text-stone-600">{copy}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <footer className="mt-8 flex flex-wrap justify-between gap-4 border-t border-stone-300 py-7 text-xs text-stone-600">
        <p>Outsaid · An independent newsroom in development</p><p>Evidence. Context. Accountability.</p>
      </footer>
    </div>
  );
}
