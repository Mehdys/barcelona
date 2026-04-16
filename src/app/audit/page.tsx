'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface AuditLog {
  run_id: string
  started_at: string
  completed_at?: string
  jd_preview: string
  phase1: {
    role_analysis?: {
      onet_code: string; onet_name: string; seniority: string
      role_type: string; confidence: number; key_requirements: string[]
    }
    scoring_config?: {
      weights: Record<string, number>
      causal_edges: { reasoning: string }
      onet_code: string; onet_name: string
      weights_justification?: Record<string, string>
    }
    clay_setup?: unknown
  }
  scoring: {
    candidates_count: number
    config_used?: { onet_code: string; weights: Record<string, number>; causal_reasoning: string }
    per_candidate?: Array<{
      name: string; score: number; confidence: number
      shap: Record<string, number>
      causal_adjustments: Array<{ signal: string; raw: number; adjusted: number; reason: string }>
      normalized: Record<string, number>
    }>
  }
  selection: { top10?: string[]; reasoning?: string; red_flags?: Array<{ name: string; flag: string }> }
  steps: Array<{ timestamp: string; step: string; data: unknown }>
}

function Collapsible({ label, children, defaultOpen = false }: {
  label: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 hover:bg-zinc-800/80 transition-colors text-left"
      >
        <span className="text-sm font-medium text-zinc-200">{label}</span>
        <span className="text-zinc-600 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 py-4 bg-zinc-900/50">{children}</div>}
    </div>
  )
}

export default function AuditPage() {
  const router  = useRouter()
  const [data,   setData]   = useState<{ audit: AuditLog } | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('barcelona_results')
    if (!raw) { router.push('/'); return }
    const parsed = JSON.parse(raw)
    if (!parsed.audit) { router.push('/results'); return }
    setData(parsed)
  }, [router])

  if (!data?.audit) return null

  const audit = data.audit

  function downloadJSON() {
    const blob = new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${audit.run_id}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const duration = audit.completed_at
    ? Math.round((new Date(audit.completed_at).getTime() - new Date(audit.started_at).getTime()) / 1000)
    : null

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit trail</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Every decision, calculation and agent output — fully traceable
          </p>
        </div>
        <button
          onClick={downloadJSON}
          className="text-sm text-zinc-400 border border-zinc-700 rounded-lg px-4 py-2 hover:border-zinc-500 hover:text-white transition-colors"
        >
          Download JSON
        </button>
      </div>

      {/* Run summary */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 grid grid-cols-2 gap-4 text-sm">
        {[
          { label: 'Run ID',       value: audit.run_id },
          { label: 'Started',      value: new Date(audit.started_at).toLocaleString() },
          { label: 'Duration',     value: duration ? `${duration}s` : '—' },
          { label: 'Candidates',   value: `${audit.scoring.candidates_count}` },
          { label: 'O*NET match',  value: audit.phase1.role_analysis?.onet_code ?? '—' },
          { label: 'Role',         value: audit.phase1.role_analysis?.onet_name ?? '—' },
        ].map(item => (
          <div key={item.label}>
            <div className="text-zinc-500 text-xs">{item.label}</div>
            <div className="text-zinc-200 font-mono text-xs mt-0.5">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Phase 1 — Role analysis */}
      {audit.phase1.role_analysis && (
        <Collapsible label="Phase 1 — Role analysis" defaultOpen>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              {[
                ['O*NET Code',   audit.phase1.role_analysis.onet_code],
                ['O*NET Name',   audit.phase1.role_analysis.onet_name],
                ['Role Type',    audit.phase1.role_analysis.role_type],
                ['Seniority',    audit.phase1.role_analysis.seniority],
                ['Confidence',   `${Math.round(audit.phase1.role_analysis.confidence * 100)}%`],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <div className="text-zinc-500 text-xs">{label}</div>
                  <div className="text-zinc-200 font-mono text-xs mt-0.5">{value}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="text-zinc-500 text-xs mb-1">Key requirements identified</div>
              <div className="flex flex-wrap gap-1.5">
                {audit.phase1.role_analysis.key_requirements.map((r, i) => (
                  <span key={i} className="text-xs bg-zinc-800 text-zinc-300 rounded px-2 py-0.5">{r}</span>
                ))}
              </div>
            </div>
          </div>
        </Collapsible>
      )}

      {/* Phase 1 — Weights */}
      {audit.phase1.scoring_config && (
        <Collapsible label="Phase 1 — Agent-derived weights + causal DAG">
          <div className="space-y-4 text-sm">
            <div className="space-y-2">
              {Object.entries(audit.phase1.scoring_config.weights)
                .sort((a, b) => b[1] - a[1])
                .map(([signal, weight]) => (
                  <div key={signal} className="flex items-center gap-3">
                    <div className="w-36 text-xs text-zinc-400">{signal.replace(/_/g, ' ')}</div>
                    <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${weight * 100}%` }} />
                    </div>
                    <div className="text-xs font-mono text-zinc-400 w-10 text-right">{Math.round(weight * 100)}%</div>
                    {audit.phase1.scoring_config?.weights_justification?.[signal] && (
                      <div className="text-xs text-zinc-600 flex-1 truncate">
                        {audit.phase1.scoring_config.weights_justification[signal]}
                      </div>
                    )}
                  </div>
                ))}
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-3 text-xs text-zinc-400 leading-relaxed">
              <span className="text-zinc-300 font-medium">Causal DAG reasoning: </span>
              {audit.phase1.scoring_config.causal_edges.reasoning}
            </div>
          </div>
        </Collapsible>
      )}

      {/* Per-candidate scoring */}
      {audit.scoring.per_candidate && (
        <Collapsible label={`Scoring — ${audit.scoring.candidates_count} candidates`}>
          <div className="space-y-4">
            {audit.scoring.per_candidate.map((c, i) => (
              <div key={i} className="border border-zinc-800 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">{c.name}</span>
                  <span className="text-sm font-black text-indigo-400">{c.score}/100</span>
                </div>

                {c.causal_adjustments.length > 0 && (
                  <div className="text-xs text-indigo-300/70 space-y-0.5">
                    {c.causal_adjustments.map((adj, j) => (
                      <div key={j}>
                        Causal: {adj.signal} {adj.raw}→{adj.adjusted} — {adj.reason}
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-xs">
                  {Object.entries(c.shap).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-zinc-400">
                      <span>{k.replace(/_/g, ' ')}</span>
                      <span className="font-mono text-indigo-400">+{v}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-600">
                  <span>confidence: {Math.round(c.confidence * 100)}%</span>
                  <span>·</span>
                  {Object.entries(c.normalized).map(([k, v]) => (
                    <span key={k}>{k.replace(/_/g, ' ')}: {Math.round((v as number) * 100)}%</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Collapsible>
      )}

      {/* Selection */}
      {audit.selection.top10 && (
        <Collapsible label="Agent selection — top 10 recommendation">
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {audit.selection.top10.map((name, i) => (
                <span key={i} className="bg-zinc-800 text-zinc-200 rounded-lg px-3 py-1 text-xs">
                  #{i + 1} {name}
                </span>
              ))}
            </div>
            <div className="text-zinc-400 leading-relaxed text-xs">{audit.selection.reasoning}</div>
            {(audit.selection.red_flags?.length ?? 0) > 0 && (
              <div className="space-y-1 pt-2 border-t border-zinc-800">
                <div className="text-yellow-500 text-xs font-semibold">Red flags</div>
                {audit.selection.red_flags!.map((f, i) => (
                  <div key={i} className="text-xs text-zinc-400">
                    <span className="text-zinc-200">{f.name}:</span> {f.flag}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Collapsible>
      )}

      {/* Raw step log */}
      <Collapsible label={`Raw execution log — ${audit.steps.length} steps`}>
        <div className="space-y-2 font-mono text-xs">
          {audit.steps.map((step, i) => (
            <div key={i} className="flex gap-3 text-zinc-500">
              <span className="text-zinc-700 shrink-0">
                {new Date(step.timestamp).toISOString().slice(11, 19)}
              </span>
              <span className="text-indigo-400 shrink-0">{step.step}</span>
              <span className="text-zinc-600 truncate">
                {typeof step.data === 'object' ? JSON.stringify(step.data).slice(0, 80) : String(step.data)}
              </span>
            </div>
          ))}
        </div>
      </Collapsible>
    </div>
  )
}
