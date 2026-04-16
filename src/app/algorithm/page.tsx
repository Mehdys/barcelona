'use client'

import { useRouter } from 'next/navigation'

const AGENTS = [
  {
    step: '01',
    name: 'Role analyst',
    trigger: 'When you paste a job description',
    what: 'Reads your JD and figures out what actually matters for this specific role — not what matters for engineering in general. Matches it to a labor database (O*NET) that tracks which skills and activities define thousands of occupations.',
    output: 'Scoring weights tuned to your role. A data scientist JD produces different weights than a backend engineer JD.',
    color: 'border-indigo-800/50 bg-indigo-950/20',
    tag: 'text-indigo-400',
  },
  {
    step: '02',
    name: 'Clay setup generator',
    trigger: 'After role analysis',
    what: 'Generates a single prompt you paste into Clay\'s Sculptor AI. That prompt instructs Clay\'s AI to research each candidate and return all 6 scoring signals as structured data — in one credit instead of six.',
    output: 'A ready-to-paste Sculptor prompt + formula column setup for your Clay table.',
    color: 'border-purple-800/50 bg-purple-950/20',
    tag: 'text-purple-400',
  },
  {
    step: '03',
    name: 'Bias corrector',
    trigger: 'Before scoring, for every candidate',
    what: 'Applies context-aware corrections before any math runs. An engineer at Google with 30 public commits isn\'t low-output — they work in private repos. A seed-stage hire who\'s stayed 14 months isn\'t a job-hopper — that\'s normal for early startups.',
    output: 'Adjusted signals that compare fairly across company sizes and stages.',
    color: 'border-blue-800/50 bg-blue-950/20',
    tag: 'text-blue-400',
  },
  {
    step: '04',
    name: 'Scorer',
    trigger: 'After bias correction',
    what: 'Runs the math. Normalizes each signal (so a "high" GitHub score means high relative to your specific candidate pool, not some global benchmark), applies the role-specific weights, and produces a score from 0 to 100.',
    output: 'A ranked score per candidate with a full breakdown of what drove it.',
    color: 'border-emerald-800/50 bg-emerald-950/20',
    tag: 'text-emerald-400',
  },
  {
    step: '05',
    name: 'Selection agent',
    trigger: 'After all candidates are scored',
    what: 'Reviews the full ranked pool as a whole — not just individual scores. Looks for patterns: are all scores suspiciously identical (data quality problem)? Is there a hidden gem the algorithm flagged but ranked lower due to thin data? Are there red flags the math can\'t catch?',
    output: 'A written reasoning memo + red flags list, visible in real time as it streams.',
    color: 'border-yellow-800/50 bg-yellow-950/20',
    tag: 'text-yellow-400',
  },
  {
    step: '06',
    name: 'Outreach writer',
    trigger: 'For every candidate, in parallel',
    what: 'Reads the candidate\'s LinkedIn headline, summary, and GitHub activity — not the score. Writes a cold email that references something specific to them: what they\'re building, what they care about, why this role is relevant to where they are right now.',
    output: 'A personalized cold email per candidate. No templates. No commit-count mentions.',
    color: 'border-orange-800/50 bg-orange-950/20',
    tag: 'text-orange-400',
  },
]

const SIGNALS = [
  {
    label: 'Have they been shipping recently?',
    signal: 'GitHub commits (last 6 months)',
    weight: 28,
    plain: 'The best engineers tend to be building things constantly — not just at work, but on side projects, open source, experiments. Recent GitHub activity is the closest proxy we have for "actively in the game."',
    caveat: 'We adjust for company size — someone at Google works in private repos and will have fewer public commits than a solo developer. We correct for this before scoring.',
  },
  {
    label: 'How deep is their experience?',
    signal: 'Years of relevant experience',
    weight: 24,
    plain: 'Straightforward — but normalized to your pool. If everyone in your list has 8–12 years, the differences there matter less than if your pool ranges from 2 to 15. The score reflects where they sit relative to who you\'re actually comparing.',
    caveat: 'This doesn\'t measure pedigree. 5 years at a high-growth startup and 5 years at a slow enterprise are different — but that\'s what stage fit captures.',
  },
  {
    label: 'Have they worked in a similar environment?',
    signal: 'Company stage match',
    weight: 22,
    plain: 'A Series B hire joining a Series A company is probably fine. A 15-year enterprise engineer joining a 12-person seed startup will likely struggle with the ambiguity and pace — even if they\'re technically exceptional.',
    caveat: 'Not a cliff edge. The penalty scales with distance. Adjacent stages score well. Opposite ends of the spectrum score poorly.',
  },
  {
    label: 'Can they actually do the job?',
    signal: 'Verified skills',
    weight: 14,
    plain: 'We count skills they\'ve demonstrably used — shipped projects, open source contributions, measurable outcomes — not skills they\'ve listed on their profile. Anyone can write "PyTorch" on LinkedIn.',
    caveat: 'Calibrated to your specific role\'s requirements. "Verified skills" for a data role counts different things than for a frontend role.',
  },
  {
    label: 'Do they stay long enough to matter?',
    signal: 'Average tenure',
    weight: 7,
    plain: 'Very short stints (under a year, repeatedly) suggest poor fit or flight risk. Very long stints (5+ years at one place) can suggest someone who hasn\'t been challenged or who struggles to move. A Gaussian curve peaks around 2 years — long enough to own something, short enough to keep growing.',
    caveat: 'Early-stage startup tenure is naturally shorter. We adjust for this by company stage.',
  },
  {
    label: 'Are they actively interested in this space?',
    signal: 'Recent post topics',
    weight: 5,
    plain: 'Someone writing about distributed systems on LinkedIn is more likely to care about a distributed systems role than someone who just lists it as a skill. Low weight because it\'s easy to game — used as a tiebreaker.',
    caveat: 'Replaced by GitHub/HN semantic analysis when we can enrich profiles. More signal, harder to fake.',
  },
]

export default function AlgorithmPage() {
  const router = useRouter()

  return (
    <div className="max-w-4xl space-y-20 py-6">

      {/* Header */}
      <div className="space-y-5">
        <div className="text-xs font-semibold text-zinc-600 uppercase tracking-widest">How it works</div>
        <h1 className="text-3xl font-black text-white">Six agents. One ranked shortlist.</h1>
        <p className="text-zinc-400 text-lg leading-relaxed max-w-2xl">
          Barcelona isn't a single algorithm — it's a sequence of specialized agents, each doing one thing well.
          The scoring math is deterministic (same inputs, same output every time). The AI agents handle the parts
          that require judgment: reading context, correcting for bias, writing outreach.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/analyze')}
            className="bg-white text-zinc-950 font-semibold px-5 py-2.5 rounded-xl hover:bg-zinc-100 transition-colors text-sm"
          >
            Try it →
          </button>
        </div>
      </div>

      {/* Agent pipeline */}
      <div className="space-y-6">
        <div className="text-xs font-semibold text-zinc-600 uppercase tracking-widest">The agent pipeline</div>
        <div className="space-y-4">
          {AGENTS.map((agent) => (
            <div key={agent.step} className={`border rounded-2xl p-6 space-y-4 ${agent.color}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-bold ${agent.tag}`}>{agent.step}</span>
                    <span className="text-white font-semibold">{agent.name}</span>
                  </div>
                  <div className="text-xs text-zinc-600">Runs: {agent.trigger}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">What it does</div>
                  <div className="text-sm text-zinc-400 leading-relaxed">{agent.what}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Output</div>
                  <div className="text-sm text-zinc-300 leading-relaxed">{agent.output}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* What we measure + why */}
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-zinc-600 uppercase tracking-widest">What we measure — and why</div>
          <p className="text-zinc-500 text-sm">Six questions. Each one chosen because it predicts something real about job fit — not because it's easy to measure.</p>
        </div>
        <div className="space-y-4">
          {SIGNALS.map(s => (
            <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-6">
                <div className="space-y-0.5">
                  <div className="text-white font-semibold">{s.label}</div>
                  <div className="text-xs text-zinc-600 font-mono">source: {s.signal}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-2xl font-black text-zinc-700 font-mono">{s.weight}%</div>
                  <div className="text-xs text-zinc-600">of total score</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-1 border-t border-zinc-800">
                <div className="text-sm text-zinc-400 leading-relaxed">{s.plain}</div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">Important caveat</div>
                  <div className="text-sm text-zinc-500 leading-relaxed">{s.caveat}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Why deterministic */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-4">
        <div className="text-white font-bold text-lg">Why the scoring is math, not AI</div>
        <div className="grid grid-cols-2 gap-6 text-sm text-zinc-400 leading-relaxed">
          <p>
            AI models are powerful but unpredictable. Ask them to score a candidate twice and you might get different answers.
            Ask them why they scored someone lower and they'll give you a plausible-sounding reason that may not be the real one.
            That's not acceptable in hiring.
          </p>
          <p>
            Barcelona's scoring formula is deterministic: same input, same output, every time.
            Every score comes with a breakdown showing exactly which signals drove it and by how much.
            You can audit it, challenge it, and explain it to a candidate.
            The AI agents handle language — narration, outreach, reasoning — not math.
          </p>
        </div>
      </div>

    </div>
  )
}
