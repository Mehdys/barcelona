'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts'
import type { ScoredCandidate, ShapValues } from '@/lib/scorer'
import type { Narration } from '@/lib/narrate'

interface CandidateResult extends ScoredCandidate {
  rank: number
  narration: Narration
}

const SIGNAL_LABELS: Record<keyof ShapValues, string> = {
  github_velocity:   'GitHub velocity',
  experience_depth:  'Experience depth',
  stage_fit:         'Stage fit',
  skill_evidence:    'Skill evidence',
  tenure_stability:  'Tenure stability',
  in_market_signal:  'In-market signal',
}

const SIGNAL_WEIGHTS: Record<keyof ShapValues, number> = {
  github_velocity:   28,
  experience_depth:  24,
  stage_fit:         22,
  skill_evidence:    14,
  tenure_stability:  7,
  in_market_signal:  5,
}

export default function SignalsPage() {
  const router = useRouter()
  const [candidates, setCandidates] = useState<CandidateResult[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('barcelona_results')
    if (!raw) { router.push('/'); return }
    const data = JSON.parse(raw)
    // Support both old format (array) and new format ({ candidates, ... })
    setCandidates(Array.isArray(data) ? data : (data.candidates ?? []))
    setLoaded(true)
  }, [router])

  if (!loaded) return null

  // Average SHAP per signal across pool
  const avgShap = Object.keys(SIGNAL_LABELS).map(key => {
    const k = key as keyof ShapValues
    const avg = candidates.reduce((s, c) => s + c.shap[k], 0) / candidates.length
    return {
      signal: SIGNAL_LABELS[k],
      avg:    Math.round(avg * 10) / 10,
      weight: SIGNAL_WEIGHTS[k],
    }
  }).sort((a, b) => b.avg - a.avg)

  // Before/after comparison: keyword rank (by yrs_experience) vs our rank
  const keywordRanked = [...candidates].sort((a, b) => b.yrs_experience - a.yrs_experience)
  const comparison = candidates.map(c => {
    const keywordRank = keywordRanked.findIndex(k => k.name === c.name) + 1
    return {
      name:        c.name.split(' ')[0],
      ourRank:     c.rank,
      keywordRank,
      shift:       keywordRank - c.rank,
    }
  }).sort((a, b) => a.ourRank - b.ourRank)

  // Radar data for top 3 candidates
  const top3 = candidates.slice(0, 3)
  const radarData = Object.keys(SIGNAL_LABELS).map(key => {
    const k = key as keyof ShapValues
    const entry: Record<string, number | string> = { signal: SIGNAL_LABELS[k] }
    top3.forEach(c => {
      entry[c.name.split(' ')[0]] = Math.round((c.normalized[k as keyof typeof c.normalized] ?? 0) * 100)
    })
    return entry
  })

  const COLORS = ['#6366f1', '#10b981', '#f59e0b']

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white">Signal dashboard</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Pool-level analysis · {candidates.length} candidates · causal adjustments applied
        </p>
      </div>

      {/* Signal importance */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-300">Average SHAP contribution per signal</div>
          <div className="text-xs text-zinc-500">pts out of 100</div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={avgShap} layout="vertical" margin={{ left: 16, right: 16 }}>
            <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} />
            <YAxis type="category" dataKey="signal" tick={{ fill: '#a1a1aa', fontSize: 11 }} width={130} />
            <Tooltip
              contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
              labelStyle={{ color: '#fff' }}
              itemStyle={{ color: '#6366f1' }}
            />
            <Bar dataKey="avg" fill="#6366f1" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="text-xs text-zinc-500">
          Top 3 signals account for {avgShap.slice(0, 3).reduce((s, d) => s + d.weight, 0)}% of the score by weight (O*NET anchored)
        </div>
      </div>

      {/* Radar — top 3 candidates */}
      {top3.length >= 2 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <div className="text-sm font-semibold text-zinc-300">Top 3 candidates — signal profile</div>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#3f3f46" />
              <PolarAngleAxis dataKey="signal" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
              {top3.map((c, i) => (
                <Radar
                  key={`${i}-${c.name}`}
                  name={c.name.split(' ')[0]}
                  dataKey={c.name.split(' ')[0]}
                  stroke={COLORS[i]}
                  fill={COLORS[i]}
                  fillOpacity={0.15}
                />
              ))}
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                labelStyle={{ color: '#fff' }}
              />
            </RadarChart>
          </ResponsiveContainer>
          <div className="flex gap-4">
            {top3.map((c, i) => (
              <div key={`${i}-${c.name}`} className="flex items-center gap-2 text-xs text-zinc-400">
                <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i] }} />
                #{c.rank} {c.name.split(' ')[0]}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Before / After comparison */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <div>
          <div className="text-sm font-semibold text-zinc-300">Keyword ranking vs causal ranking</div>
          <div className="text-xs text-zinc-500 mt-1">
            Keyword rank = sorted by years of experience only
          </div>
        </div>
        <div className="space-y-2">
          {comparison.map((c, i) => (
            <div key={`${i}-${c.name}`} className="flex items-center gap-3">
              <div className="w-5 text-xs text-zinc-500 text-right">#{c.ourRank}</div>
              <div className="w-28 text-sm text-zinc-300 truncate">{c.name}</div>
              <div className="flex-1 flex items-center gap-2">
                <div className="text-xs text-zinc-500 w-20">keyword #{c.keywordRank}</div>
                {c.shift > 0 ? (
                  <div className="text-xs text-red-400 font-mono">↓ {c.shift} spots</div>
                ) : c.shift < 0 ? (
                  <div className="text-xs text-emerald-400 font-mono">↑ {Math.abs(c.shift)} spots</div>
                ) : (
                  <div className="text-xs text-zinc-600 font-mono">= same</div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="text-xs text-zinc-600 pt-2 border-t border-zinc-800">
          Green = candidates a keyword scanner undervalued. Red = overvalued.
        </div>
      </div>
    </div>
  )
}
