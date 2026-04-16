import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Barcelona — Explainable AI Layer for Clay',
  description: 'The explainability layer on top of Clay. Every candidate decision with a full audit trail — SHAP breakdowns, causal adjustments, no black boxes.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100">
        <nav className="border-b border-zinc-800/60 bg-zinc-950/90 backdrop-blur sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
            <a href="/" className="font-bold text-white tracking-tight text-sm">
              Barcelona <span className="text-zinc-600 font-normal ml-1">/ Clay</span>
            </a>
            <div className="flex items-center gap-1 text-sm">
              {[
                { href: '/analyze',   label: '1. Analyze JD' },
                { href: '/setup',     label: '2. Clay Setup' },
                { href: '/score',     label: '3. Score' },
                { href: '/results',   label: 'Results' },
                { href: '/algorithm', label: 'Algorithm' },
                { href: '/runs',      label: 'Runs' },
              ].map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  className="px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-6 py-10">
          {children}
        </main>
      </body>
    </html>
  )
}
