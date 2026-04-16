'use client'

import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const router = useRouter()

  return (
    <div className="space-y-28 py-8">

      {/* Hero */}
      <div className="max-w-3xl space-y-6">
        <div className="inline-flex items-center gap-2 text-xs font-mono text-indigo-400 bg-indigo-950/40 border border-indigo-800/40 rounded-full px-3 py-1">
          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
          Explainable · Auditable · No black boxes
        </div>
        <h1 className="text-5xl font-black text-white leading-tight tracking-tight">
          Clay gives you 200 people.<br />
          <span className="text-zinc-500">We tell you which 12 to call.</span>
        </h1>
        <p className="text-zinc-400 text-lg leading-relaxed max-w-2xl">
          You enriched 200 candidates in Clay. Now you're staring at a spreadsheet with no idea who to call.
          Barcelona takes that CSV, ranks every candidate, and tells you exactly why each one is or isn't worth your time —
          which signals drove the score, what's missing, and what would move them up.
        </p>
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => router.push('/analyze')}
            className="bg-white text-zinc-950 font-bold px-6 py-3 rounded-xl hover:bg-zinc-100 transition-colors text-sm"
          >
            Analyze a job description →
          </button>
          <a href="/results" className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors px-2">
            See example results
          </a>
          <a href="/algorithm" className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors px-2">
            How it works →
          </a>
        </div>
      </div>

      {/* The problem */}
      <div className="grid grid-cols-2 gap-12 items-center">
        <div className="space-y-4">
          <div className="text-xs font-semibold text-zinc-600 uppercase tracking-widest">The problem</div>
          <h2 className="text-2xl font-bold text-white leading-snug">
            Clay enriches your pipeline. But it doesn't explain its decisions.
          </h2>
          <p className="text-zinc-500 text-sm leading-relaxed">
            You get a score — or a sort — but no reason. Why is Alice ranked above Sara? Which signal drove it? What would change it? Without answers, you're still relying on gut feel. The data is there. The explanation isn't.
          </p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-2">
          <div className="text-xs text-zinc-600 uppercase tracking-wider font-semibold pb-2">Clay sort — no explanation given</div>
          {[
            { name: 'Alice M.', note: '12 yrs · Google · Lists: PyTorch, Kubernetes',          rank: 1,  gem: false },
            { name: 'Bob K.',   note: '8 yrs · Meta · Lists: ML, Python, Spark',               rank: 2,  gem: false },
            { name: 'James R.', note: '10 yrs · Oracle · Lists: Java, CI/CD',                  rank: 3,  gem: false },
            { name: 'Sara L.',  note: '5 yrs · Series A · 300 commits · built vLLM plugin',   rank: 9,  gem: true  },
          ].map((c, i) => (
            <div key={i} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${c.gem ? 'bg-emerald-950/30 border border-emerald-800/30' : 'bg-zinc-800/30'}`}>
              <div className={`text-xs font-mono font-bold w-6 shrink-0 ${c.gem ? 'text-emerald-400' : 'text-zinc-600'}`}>#{c.rank}</div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${c.gem ? 'text-emerald-300' : 'text-zinc-400'}`}>{c.name}</div>
                <div className="text-xs text-zinc-600 truncate">{c.note}</div>
              </div>
              {c.gem && <div className="text-xs text-emerald-500 font-mono shrink-0">buried</div>}
            </div>
          ))}
          <div className="text-xs text-zinc-700 pt-2 border-t border-zinc-800">Why is Sara at #9? Clay doesn't say. Barcelona does.</div>
        </div>
      </div>

      {/* The solution */}
      <div className="space-y-8">
        <div className="text-xs font-semibold text-zinc-600 uppercase tracking-widest">How it works</div>
        <div className="grid grid-cols-3 gap-6">
          {[
            { n: '01', title: 'Paste a JD URL', desc: 'Barcelona reads your role, matches it to labor market data, and builds a scoring model specific to that hire — not a generic template.' },
            { n: '02', title: 'Enrich in Clay', desc: 'One Sculptor prompt, one credit per candidate. Export the CSV — your existing Clay table, no changes needed.' },
            { n: '03', title: 'Every rank explained', desc: 'Each candidate gets a score, a SHAP breakdown, a counterfactual, and a written reason. You know why — and what would change it.' },
          ].map(s => (
            <div key={s.n} className="space-y-3">
              <div className="text-4xl font-black text-zinc-800 font-mono">{s.n}</div>
              <div className="text-white font-semibold">{s.title}</div>
              <div className="text-zinc-500 text-sm leading-relaxed">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* What you get */}
      <div className="space-y-6">
        <div className="text-xs font-semibold text-zinc-600 uppercase tracking-widest">What the explainability layer adds</div>
        <div className="grid grid-cols-2 gap-4">
          {[
            {
              label: 'Auditable score (0–100)',
              desc: 'Deterministic formula. Same input, same output, every time. No black box — every number has a traceable source.',
              color: 'text-white',
            },
            {
              label: 'SHAP signal breakdown',
              desc: 'Which signals drove the rank — and by how much. You can see exactly why Alice is above Sara before you pick up the phone.',
              color: 'text-indigo-400',
            },
            {
              label: 'Hidden gem flag',
              desc: 'Strong signals, thin data. Candidates keyword filters bury — surfaced with an explanation of why they deserve a second look.',
              color: 'text-purple-400',
            },
            {
              label: 'Counterfactual',
              desc: '"Fix this one signal and they jump from 61 to 79." Shows what would actually move the needle — for coaching or context.',
              color: 'text-yellow-400',
            },
            {
              label: 'Written reasoning memo',
              desc: 'A full pool review — anomalies, patterns, red flags the formula can\'t catch. Readable, not a dashboard.',
              color: 'text-emerald-400',
            },
            {
              label: 'Personalized outreach',
              desc: 'Cold email written from their actual headline, summary, and GitHub activity. References what they built — not a mail merge.',
              color: 'text-orange-400',
            },
          ].map(item => (
            <div key={item.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-4">
              <div className="w-1.5 bg-zinc-800 rounded-full shrink-0" />
              <div className="space-y-1">
                <div className={`text-sm font-semibold ${item.color}`}>{item.label}</div>
                <div className="text-xs text-zinc-500 leading-relaxed">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Key principles */}
      <div className="grid grid-cols-3 gap-5">
        {[
          {
            tag: 'Explainable',
            title: 'Every decision has a reason',
            desc: 'Claude narrates. It never scores. Every rank is produced by a deterministic formula — SHAP values show exactly which signals drove it and by how much. Reproducible, auditable, defensible.',
          },
          {
            tag: 'Role-aware',
            title: 'Weights derived per JD',
            desc: 'GitHub velocity matters more for an infra engineer than a sales lead. O*NET importance scores drive the weighting — not our assumptions.',
          },
          {
            tag: 'Clay-native',
            title: 'Plugs into your Clay table',
            desc: 'The setup page generates a single Sculptor prompt. One AI column returns all 6 signals as JSON. Formula columns extract them. Your enrichment, made legible.',
          },
        ].map(d => (
          <div key={d.title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
            <div className="inline-block text-xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/30 rounded-full px-2 py-0.5">
              {d.tag}
            </div>
            <div className="text-white font-semibold">{d.title}</div>
            <div className="text-zinc-500 text-sm leading-relaxed">{d.desc}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="border border-zinc-800 rounded-2xl p-10 text-center space-y-5 bg-zinc-900/40">
        <div className="space-y-2">
          <div className="text-2xl font-bold text-white">Make your Clay pipeline legible.</div>
          <div className="text-zinc-500 text-sm max-w-lg mx-auto">
            Paste a job URL, get your Clay setup, upload your enriched CSV.
            Every candidate ranked, explained, and ready to act on — in under 5 minutes.
          </div>
        </div>
        <button
          onClick={() => router.push('/analyze')}
          className="bg-white text-zinc-950 font-bold px-8 py-3.5 rounded-xl hover:bg-zinc-100 transition-colors text-sm"
        >
          Add the explainability layer →
        </button>
      </div>

    </div>
  )
}
