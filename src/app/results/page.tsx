'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CandidateCard } from '@/components/CandidateCard'

interface ResultsData {
  candidates: ReturnType<typeof Object.assign>[]
  top10: string[]
  agentReasoning: string
  redFlags: { name: string; flag: string }[]
  scoringConfig: { onet_code?: string; onet_name?: string; weights: Record<string, number> }
  roleAnalysis: { onet_name: string; seniority: string }
}

export default function ResultsPage() {
  const router   = useRouter()
  const [data,   setData]   = useState<ResultsData | null>(null)
  const [tab,    setTab]    = useState<'top10' | 'all'>('top10')
  const [runId,  setRunId]  = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('barcelona_results')
    if (!raw) { router.push('/'); return }
    setData(JSON.parse(raw))
    setRunId(sessionStorage.getItem('barcelona_run_id'))
  }, [router])

  function copyShareLink() {
    if (!runId) return
    navigator.clipboard.writeText(`${window.location.origin}/results/${runId}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!data) return null

  const { candidates, top10, agentReasoning, redFlags, scoringConfig, roleAnalysis } = data
  const hiddenGems = candidates.filter((c: { is_hidden_gem: boolean }) => c.is_hidden_gem)
  const top10Candidates = candidates.filter((c: { name: string }) => top10.includes(c.name))
  const top10Sorted = top10.map(name => top10Candidates.find((c: { name: string }) => c.name === name)).filter(Boolean)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Results</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {candidates.length} candidates scored · {roleAnalysis?.onet_name ?? 'Engineering'} · {scoringConfig?.onet_code}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {runId && (
            <button
              onClick={copyShareLink}
              className="text-sm text-zinc-400 border border-zinc-700 rounded-lg px-3 py-2 hover:border-zinc-500 hover:text-white transition-colors"
            >
              {copied ? '✓ Copied' : 'Share link'}
            </button>
          )}
          <button
            onClick={() => router.push('/signals')}
            className="text-sm text-zinc-400 border border-zinc-700 rounded-lg px-3 py-2 hover:border-zinc-500 hover:text-white transition-colors"
          >
            Signal dashboard
          </button>
          <button
            onClick={() => router.push('/audit')}
            className="text-sm text-zinc-400 border border-zinc-700 rounded-lg px-3 py-2 hover:border-zinc-500 hover:text-white transition-colors"
          >
            Audit trail
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Top score',     value: `${(candidates[0] as { score: number })?.score ?? 0}`, color: 'text-emerald-400' },
          { label: 'Hidden gems',   value: `${hiddenGems.length}`,       color: 'text-purple-400' },
          { label: 'Pool average',  value: `${Math.round(candidates.reduce((s: number, c: { score: number }) => s + c.score, 0) / candidates.length)}`, color: 'text-zinc-300' },
          { label: 'Red flags',     value: `${redFlags.length}`,         color: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</div>
            <div className="text-xs text-zinc-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Agent recommendation */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Agent recommendation</div>
        <p className="text-sm text-zinc-300 leading-relaxed">{agentReasoning}</p>
        {redFlags.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-zinc-800">
            <div className="text-xs text-yellow-500 font-semibold uppercase tracking-wider">Red flags</div>
            {redFlags.map((f: { name: string; flag: string }, i: number) => (
              <div key={i} className="text-xs text-zinc-400">
                <span className="text-zinc-200 font-medium">{f.name}:</span> {f.flag}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tab toggle */}
      <div className="flex gap-2">
        {[
          { key: 'top10', label: `Top ${top10.length}` },
          { key: 'all',   label: `All ${candidates.length}` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as 'top10' | 'all')}
            className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
              tab === t.key
                ? 'bg-white text-zinc-950'
                : 'text-zinc-400 border border-zinc-700 hover:border-zinc-500 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Hidden gems banner */}
      {tab === 'all' && hiddenGems.length > 0 && (
        <div className="flex items-center gap-3 bg-purple-950/30 border border-purple-800/40 rounded-xl px-4 py-3">
          <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse shrink-0" />
          <p className="text-sm text-purple-300">
            <span className="font-semibold">{hiddenGems.length} hidden gem{hiddenGems.length > 1 ? 's' : ''}</span> flagged —
            strong signals with incomplete data. A keyword scanner would pass them.
          </p>
        </div>
      )}

      {/* Candidate cards */}
      <div className="space-y-3">
        {(tab === 'top10' ? top10Sorted : candidates).map((c: unknown, i: number) => (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <CandidateCard key={`${i}-${(c as any).name}`} candidate={c as any} />
        ))}
      </div>
    </div>
  )
}
