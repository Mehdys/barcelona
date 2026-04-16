'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Zap, AlertTriangle, TrendingUp, Mail, GitBranch, Wifi } from 'lucide-react'
import type { ShapValues, ScoredCandidate } from '@/lib/scorer'
import type { Narration } from '@/lib/narrate'

interface CandidateResult extends ScoredCandidate {
  rank: number
  counterfactual_score: number
  gap_signal: string
  narration: Narration
}

const SIGNAL_LABELS: Record<string, string> = {
  github_velocity:  'GitHub velocity',
  experience_depth: 'Experience',
  stage_fit:        'Stage fit',
  skill_evidence:   'Skill evidence',
  tenure_stability: 'Tenure',
  in_market_signal: 'In-market',
}

const scoreColor = (s: number) => s >= 70 ? 'text-emerald-400' : s >= 50 ? 'text-yellow-400' : 'text-red-400'
const scoreRing  = (s: number) => s >= 70 ? 'ring-emerald-500/30' : s >= 50 ? 'ring-yellow-500/30' : 'ring-red-500/30'

export function CandidateCard({ candidate }: { candidate: CandidateResult }) {
  const [expanded, setExpanded] = useState(candidate.rank === 1)
  const [copied,   setCopied]   = useState(false)

  const shapEntries = Object.entries(candidate.shap) as [string, number][]
  const sorted      = shapEntries.sort((a, b) => b[1] - a[1])
  const maxShap     = sorted[0][1]

  function copyEmail() {
    navigator.clipboard.writeText(candidate.narration.outreach)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`bg-zinc-900 border border-zinc-800 rounded-xl ring-1 ${scoreRing(candidate.score)} overflow-hidden`}>
      {/* Header */}
      <div
        className="flex items-center justify-between p-5 cursor-pointer hover:bg-zinc-800/40 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-400">
            #{candidate.rank}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">{candidate.name}</span>
              {candidate.is_hidden_gem && (
                <span className="text-xs bg-purple-950 text-purple-400 border border-purple-800/60 rounded-full px-2 py-0.5 font-medium">
                  Hidden gem
                </span>
              )}
            </div>
            <div className="text-zinc-500 text-sm">
              {candidate.yrs_experience}yr · {candidate.company_stage} · {candidate.github_commits_6m} commits
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Score + uncertainty */}
          <div className="text-right">
            <div className={`text-3xl font-black tabular-nums ${scoreColor(candidate.score)}`}>
              {candidate.score}
            </div>
            {candidate.uncertainty > 0 && (
              <div className="text-xs text-zinc-600 font-mono">±{candidate.uncertainty}pts</div>
            )}
          </div>
          {expanded
            ? <ChevronUp   size={16} className="text-zinc-600" />
            : <ChevronDown size={16} className="text-zinc-600" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-zinc-800 p-5 space-y-5">

          {/* Confidence bar */}
          <div className="flex items-center gap-3">
            <div className="text-xs text-zinc-500 w-28 shrink-0">Data confidence</div>
            <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${candidate.confidence >= 0.7 ? 'bg-emerald-500' : candidate.confidence >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${candidate.confidence * 100}%` }}
              />
            </div>
            <div className="text-xs font-mono text-zinc-500 w-10">
              {Math.round(candidate.confidence * 100)}%
            </div>
          </div>

          {/* Causal adjustments applied */}
          {candidate.causal_adjustments?.length > 0 && (
            <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                <GitBranch size={11} />
                Causal adjustments applied
              </div>
              {candidate.causal_adjustments.map((adj, i) => (
                <div key={i} className="text-xs text-indigo-300/70">
                  <span className="font-mono">{adj.signal}</span>: {adj.raw} → {adj.adjusted}
                  <span className="text-indigo-400/50 ml-1">({adj.reason.split(':')[0]})</span>
                </div>
              ))}
            </div>
          )}

          {/* Digital exhaust — semantic fit */}
          {candidate.semantic_fit_score != null && (
            <div className="bg-purple-950/30 border border-purple-800/40 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-purple-400 uppercase tracking-wider">
                  <Wifi size={11} />
                  Digital exhaust — semantic fit
                </div>
                <div className="text-xs font-mono text-purple-300">
                  {candidate.semantic_fit_score}/10
                </div>
              </div>
              {candidate.semantic_fit_topics?.length ? (
                <div className="flex flex-wrap gap-1">
                  {candidate.semantic_fit_topics.map(t => (
                    <span key={t} className="text-xs bg-purple-900/50 text-purple-300 border border-purple-800/40 rounded px-1.5 py-0.5">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="text-xs text-purple-300/60">
                Cosine similarity between GitHub repos + HN activity and job description
              </div>
            </div>
          )}

          {/* SHAP bar chart */}
          <div>
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Score decomposition (SHAP)</div>
            <div className="space-y-2">
              {sorted.map(([signal, pts]) => (
                <div key={signal} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-zinc-400 text-right shrink-0">
                    {SIGNAL_LABELS[signal] ?? signal}
                  </div>
                  <div className="flex-1 bg-zinc-800 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${Math.max(2, (pts / maxShap) * 100)}%` }}
                    />
                  </div>
                  <div className="text-xs font-mono text-zinc-400 w-10 text-right">+{pts}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Why */}
          <div className="bg-zinc-800/50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">
              <TrendingUp size={12} />
              Why #{candidate.rank}
            </div>
            <div className="text-sm text-zinc-300 whitespace-pre-line leading-relaxed">
              {candidate.narration.why}
            </div>
          </div>

          {/* Hidden signal */}
          <div className="bg-zinc-800/50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
              <Zap size={12} />
              Hidden signal
            </div>
            <div className="text-sm text-zinc-300">{candidate.narration.hidden}</div>
          </div>

          {/* Gap + counterfactual */}
          <div className="bg-zinc-800/50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-2">
              <AlertTriangle size={12} />
              Gap & counterfactual
            </div>
            <div className="text-sm text-zinc-300 mb-2">{candidate.narration.gap}</div>
            <div className="text-xs text-zinc-500 font-mono bg-zinc-900 rounded px-3 py-2">
              {candidate.narration.counter}
            </div>
          </div>

          {/* Outreach */}
          <div className="bg-zinc-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
                <Mail size={12} />
                Personalized outbound email
              </div>
              <button onClick={copyEmail} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="text-sm text-zinc-300 whitespace-pre-line leading-relaxed font-mono text-xs bg-zinc-900 rounded-lg p-3">
              {candidate.narration.outreach}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
