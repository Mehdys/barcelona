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
          Deterministic · No hallucinations · Full audit trail
        </div>
        <h1 className="text-5xl font-black text-white leading-tight tracking-tight">
          Clay gives you 200 people.<br />
          <span className="text-zinc-500">We tell you which 12 to call.</span>
        </h1>
        <p className="text-zinc-400 text-lg leading-relaxed max-w-2xl">
          Barcelona is a candidate scoring engine that sits on top of your Clay enrichment.
          It replaces gut-feel shortlisting with a transparent, auditable algorithm —
          O*NET-backed weights, causal adjustments, and SHAP explainability per candidate.
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
            Sorting by years of experience is keyword filtering dressed up as recruiting.
          </h2>
          <p className="text-zinc-500 text-sm leading-relaxed">
            It buries the engineer with 300 GitHub commits and a shipped vLLM plugin. It surfaces the enterprise hire who'll struggle in a 12-person team. The signal is there — you just don't have a system to read it.
          </p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-2">
          <div className="text-xs text-zinc-600 uppercase tracking-wider font-semibold pb-2">Keyword sort — who rises to the top</div>
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
          <div className="text-xs text-zinc-700 pt-2 border-t border-zinc-800">Sara would have been your best hire.</div>
        </div>
      </div>

      {/* The solution */}
      <div className="space-y-8">
        <div className="text-xs font-semibold text-zinc-600 uppercase tracking-widest">How it works</div>
        <div className="grid grid-cols-3 gap-6">
          {[
            { n: '01', title: 'Paste a JD URL', desc: 'The agent reads your role and derives scoring weights specific to it. Not generic — tuned to your exact hire.' },
            { n: '02', title: 'Enrich in Clay', desc: 'One Sculptor prompt, one credit per candidate. Export the CSV — no manual column setup.' },
            { n: '03', title: 'Get a ranked shortlist', desc: 'Every candidate scored, explained, and ready to reach out to. With a personalized email written from their actual background.' },
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
        <div className="text-xs font-semibold text-zinc-600 uppercase tracking-widest">What you get per candidate</div>
        <div className="grid grid-cols-2 gap-4">
          {[
            {
              label: 'Ranked score (0–100)',
              desc: 'Deterministic. Same input always gives the same output. Run it twice, get the same ranking.',
              color: 'text-white',
            },
            {
              label: 'SHAP breakdown',
              desc: 'See exactly which signals drove the score — and by how much. GitHub velocity, stage fit, skill evidence, tenure stability.',
              color: 'text-indigo-400',
            },
            {
              label: 'Hidden gem flag',
              desc: 'Candidates with strong signals but thin data get flagged. These are the people keyword filtering buries every time.',
              color: 'text-purple-400',
            },
            {
              label: 'Counterfactual',
              desc: '"If this candidate fixed their weakest signal, they\'d jump from 61 to 79." Shows exactly what coaching or context would change.',
              color: 'text-yellow-400',
            },
            {
              label: 'Agent reasoning',
              desc: 'An AI agent reviews the full ranked pool and flags anomalies, red flags, and patterns the algorithm can\'t explain — visible in real time.',
              color: 'text-emerald-400',
            },
            {
              label: 'Personalized outreach',
              desc: 'A cold email written from their LinkedIn headline, summary, and GitHub activity. Not a template — references what they actually built.',
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
            tag: 'Transparent',
            title: 'Math, not prompts',
            desc: 'Claude narrates. It never scores. Every rank is produced by a deterministic formula with a full audit log — reproducible, explainable, defensible.',
          },
          {
            tag: 'Role-aware',
            title: 'Weights derived per JD',
            desc: 'GitHub velocity matters more for an infra engineer than a sales lead. O*NET importance scores drive the weighting — not our assumptions.',
          },
          {
            tag: 'Clay-native',
            title: 'One prompt, one credit',
            desc: 'The setup page generates a single Clay Sculptor prompt. One AI column returns all 6 signals as JSON. Formula columns extract them. No manual setup per signal.',
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
          <div className="text-2xl font-bold text-white">Ready to find the Sara in your pipeline?</div>
          <div className="text-zinc-500 text-sm max-w-lg mx-auto">
            Paste a job URL, get your Clay setup, upload your enriched CSV.
            First ranked shortlist in under 5 minutes.
          </div>
        </div>
        <button
          onClick={() => router.push('/analyze')}
          className="bg-white text-zinc-950 font-bold px-8 py-3.5 rounded-xl hover:bg-zinc-100 transition-colors text-sm"
        >
          Score my pipeline →
        </button>
      </div>

    </div>
  )
}
