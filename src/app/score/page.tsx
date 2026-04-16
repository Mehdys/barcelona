'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import type { RawCandidate } from '@/lib/scorer'

const SAMPLE_CSV = `name,github_commits_6m,yrs_experience,company_stage,avg_tenure_months,post_topics_match,skills_verified,github_username
Alex Chen,245,6,series_b,28,7,8,alexchen-dev
Marcus Johnson,89,9,enterprise,48,2,6,
Jordan Lee,42,4,enterprise,18,3,4,
Sarah Kim,312,5,series_a,22,8,9,sarahkim
David Park,156,7,series_c,36,5,7,
Emma Wilson,28,3,seed,14,6,3,emmawilson
Ryan Martinez,178,8,pre_ipo,42,4,8,
Priya Patel,267,5,series_b,24,9,10,priyapatel
Tom Anderson,45,11,enterprise,60,1,5,
Lisa Zhang,198,6,series_a,20,7,7,lisazhang
Michael Brown,88,4,series_b,26,5,6,
Nina Okafor,334,3,seed,16,10,8,ninaokafor`

interface StreamStep { label: string; index: number }
interface StreamProgress { completed: number; total: number }
interface AgentSelection {
  reasoning: string
  redFlags: { name: string; flag: string }[]
  top10: string[]
}

const scoreColor = (s: number) =>
  s >= 70 ? 'text-emerald-400' : s >= 50 ? 'text-yellow-400' : 'text-red-400'

// Strip all non-alphanumeric characters for fuzzy matching
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Resolve a column value — tries exact, normalized-exact, then contains (handles Clay prefix columns)
function col(row: Record<string, string>, ...keys: string[]): string | undefined {
  const rowKeys = Object.keys(row)
  for (const k of keys) {
    // 1. Exact match
    if (row[k] !== undefined) return row[k]
    const normK = norm(k)
    // 2. Normalized exact match (case + separator insensitive)
    const exact = rowKeys.find(rk => norm(rk) === normK)
    if (exact !== undefined) return row[exact]
    // 3. Contains match — handles "AI Column Name field_name" prefix pattern from Clay
    const contains = rowKeys.find(rk => norm(rk).includes(normK) && normK.length >= 6)
    if (contains !== undefined) return row[contains]
  }
  return undefined
}

function detectMissingColumns(rows: Record<string, string>[]): string[] {
  if (!rows.length) return []
  const row = rows[0]
  const required: [string, string[]][] = [
    ['name',              ['name', 'full_name', 'candidate_name']],
    ['github_commits_6m', ['github_commits_6m', 'github_commits', 'commits_6m']],
    ['yrs_experience',    ['yrs_experience', 'yrs_ml_experience', 'years_experience', 'experience_years']],
    ['company_stage',     ['company_stage', 'stage', 'current_stage']],
    ['avg_tenure_months', ['avg_tenure_months', 'tenure_months', 'avg_tenure']],
    ['skills_verified',   ['skills_verified', 'verified_skills', 'skills']],
  ]
  return required
    .filter(([, aliases]) => col(row, ...aliases) === undefined)
    .map(([label]) => label)
}

export default function ScorePage() {
  const router  = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fileName,        setFileName]        = useState('')
  const [candidates,      setCandidates]      = useState<RawCandidate[]>([])
  const [preview,         setPreview]         = useState<RawCandidate[]>([])
  const [loading,         setLoading]         = useState(false)
  const [currentStep,     setCurrentStep]     = useState<StreamStep | null>(null)
  const [progress,        setProgress]        = useState<StreamProgress | null>(null)
  const [liveCandidates,  setLiveCandidates]  = useState<Record<string, unknown>[]>([])
  const [enrichedCount,   setEnrichedCount]   = useState(0)
  const [agentSelection,  setAgentSelection]  = useState<AgentSelection | null>(null)
  const [webhookId,       setWebhookId]       = useState('')
  const [webhookLoading,  setWebhookLoading]  = useState(false)
  const [columnWarning,   setColumnWarning]   = useState<string[]>([])
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])
  const [error,           setError]           = useState('')

  // Auto-load candidates generated from setup page
  useEffect(() => {
    const raw = sessionStorage.getItem('barcelona_generated_candidates')
    if (!raw) return
    sessionStorage.removeItem('barcelona_generated_candidates')
    try {
      const parsed = JSON.parse(raw) as RawCandidate[]
      if (parsed.length) {
        setCandidates(parsed)
        setPreview(parsed.slice(0, 4))
        setFileName(`generated: ${parsed.length} candidates`)
      }
    } catch { /* ignore */ }
  }, [])

  async function loadFromWebhook() {
    if (!webhookId.trim()) return
    setWebhookLoading(true)
    setError('')
    try {
      const res  = await fetch(`/api/clay-webhook/load?webhook_id=${encodeURIComponent(webhookId.trim())}`)
      const data = await res.json() as { candidates?: RawCandidate[]; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to load')
      if (!data.candidates?.length) throw new Error('No candidates found for this webhook ID')
      setCandidates(data.candidates)
      setPreview(data.candidates.slice(0, 4))
      setFileName(`webhook: ${webhookId.trim()}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load webhook candidates')
    } finally {
      setWebhookLoading(false)
    }
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'sample_candidates.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError('')
    setColumnWarning([])
    setDetectedHeaders([])
    setLiveCandidates([])

    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete(results) {
        try {
          const rows = results.data as Record<string, string>[]
          const headers = rows.length ? Object.keys(rows[0]) : []
          setDetectedHeaders(headers)
          const missing = detectMissingColumns(rows)
          if (missing.length) setColumnWarning(missing)

          const parsed: RawCandidate[] = rows.map(row => ({
            name:              col(row, 'name', 'full_name', 'Full Name', 'candidate_name', 'Name') ?? 'Unknown',
            github_commits_6m: Number(col(row, 'github_commits_6m', 'github_commits', 'commits_6m') ?? 0),
            yrs_experience:    Number(col(row, 'yrs_experience', 'yrs_ml_experience', 'years_experience', 'experience_years') ?? 0),
            company_stage:     (col(row, 'company_stage', 'stage', 'current_stage') ?? 'series_b').toLowerCase().replace(/[\s-]/g, '_'),
            avg_tenure_months: Number(col(row, 'avg_tenure_months', 'tenure_months', 'avg_tenure') ?? 0),
            post_topics_match: Number(col(row, 'post_topics_match', 'topics_match', 'post_topics') ?? 0),
            skills_verified:   Number(col(row, 'skills_verified', 'verified_skills', 'skills') ?? 0),
            github_username:   col(row, 'github_username', 'github')?.trim() || undefined,
            hn_username:       col(row, 'hn_username', 'hackernews')?.trim() || undefined,
            headline:          col(row, 'headline', 'Headline', 'linkedin_headline')?.trim() || undefined,
            summary:           col(row, 'summary', 'Summary', 'about', 'linkedin_summary')?.trim() || undefined,
            job_title:         col(row, 'job_title', 'Job Title', 'title', 'current_title')?.trim() || undefined,
            company_name:      col(row, 'company_name', 'Company Name', 'company', 'current_company')?.trim() || undefined,
          }))
          setCandidates(parsed)
          setPreview(parsed.slice(0, 4))
        } catch {
          setError('Could not parse CSV. Check column names.')
        }
      },
      error() { setError('Failed to read file.') },
    })
  }

  async function handleScore() {
    if (!candidates.length) return setError('Upload a CSV first.')
    setLoading(true)
    setError('')
    setLiveCandidates([])
    setProgress(null)
    setCurrentStep(null)
    setEnrichedCount(0)
    setAgentSelection(null)

    try {
      const setupRaw = sessionStorage.getItem('barcelona_setup')
      const setup    = setupRaw ? JSON.parse(setupRaw) : null
      const jd       = sessionStorage.getItem('barcelona_jd') ?? ''

      const res = await fetch('/api/score', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidates,
          jdSummary:    jd,
          scoringConfig: setup?.scoringConfig ?? null,
          roleAnalysis:  setup?.roleAnalysis  ?? null,
        }),
      })

      if (!res.ok) throw new Error('Scoring failed')
      if (!res.body)  throw new Error('No stream body')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''
      const allCandidates: Record<string, unknown>[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''

        for (const chunk of chunks) {
          if (!chunk.startsWith('data: ')) continue

          // Parse JSON first — skip malformed chunks
          let event: string, data: Record<string, unknown>
          try {
            ;({ event, data } = JSON.parse(chunk.slice(6)) as { event: string; data: Record<string, unknown> })
          } catch {
            continue
          }

          // Handle each event outside the parse try-catch so errors are not swallowed
          if (event === 'step')       setCurrentStep(data as StreamStep)
          if (event === 'progress')   setProgress(data as StreamProgress)
          if (event === 'enrich')     setEnrichedCount(n => n + 1)
          if (event === 'selection')  setAgentSelection(data as AgentSelection)
          if (event === 'candidate') {
            allCandidates.push(data)
            setLiveCandidates([...allCandidates].sort((a, b) => (a.rank as number) - (b.rank as number)))
          }
          if (event === 'done') {
            const results = { ...data, candidates: allCandidates }
            sessionStorage.setItem('barcelona_results', JSON.stringify(results))
            if (data.run_id) sessionStorage.setItem('barcelona_run_id', String(data.run_id))
            router.push('/results')
          }
          if (event === 'error') {
            throw new Error(String(data.message ?? 'Scoring failed'))
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      // Always reset loading — covers: errors, stream closing without done, unexpected ends
      setLoading(false)
      setCurrentStep(null)
    }
  }

  return (
    <div className="space-y-8">
      <div className="max-w-2xl space-y-1">
        <h1 className="text-2xl font-bold text-white">Upload Clay CSV</h1>
        <p className="text-zinc-400 text-sm">Export your enriched Clay table and upload it here.</p>
      </div>

      <div className="grid grid-cols-5 gap-8">
        {/* Left — upload */}
        <div className="col-span-2 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-zinc-300">CSV file</label>
              <button onClick={downloadSample} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Download sample
              </button>
            </div>
            <div
              onClick={() => fileRef.current?.click()}
              className="border border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-zinc-500 hover:bg-zinc-900/50 transition-colors"
            >
              {fileName ? (
                <div className="space-y-1">
                  <div className="text-white font-medium text-sm">{fileName}</div>
                  <div className="text-zinc-500 text-xs">{candidates.length} candidates</div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-zinc-400 text-sm">Click to upload</div>
                  <div className="text-zinc-600 text-xs">name, github_commits_6m, yrs_experience…</div>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
          </div>

          {/* Load from Clay webhook */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-xs text-zinc-600">or load from Clay webhook</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>
            <div className="flex gap-2">
              <input
                value={webhookId}
                onChange={e => setWebhookId(e.target.value)}
                placeholder="wh_1712345678_abc1"
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 font-mono"
              />
              <button
                onClick={loadFromWebhook}
                disabled={webhookLoading || !webhookId.trim()}
                className="text-xs px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-40 shrink-0"
              >
                {webhookLoading ? '…' : 'Load'}
              </button>
            </div>
            <div className="text-xs text-zinc-700">Paste the <span className="font-mono text-zinc-600">webhook_id</span> returned by the Clay webhook</div>
          </div>

          {preview.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {['Name', 'GitHub', 'Yrs', 'Stage'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-zinc-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((c, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 last:border-0">
                      <td className="px-3 py-2 text-zinc-200">{c.name.split(' ')[0]}</td>
                      <td className="px-3 py-2 text-zinc-400">{c.github_commits_6m}</td>
                      <td className="px-3 py-2 text-zinc-400">{c.yrs_experience}yr</td>
                      <td className="px-3 py-2 text-zinc-400">{c.company_stage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Status */}
          {loading && currentStep && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-white">
                <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse shrink-0" />
                {currentStep.label}
              </div>
              {/* Enrichment progress bar */}
              {enrichedCount > 0 && currentStep.index === 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>GitHub + HN profiles</span>
                    <span>{enrichedCount}/{candidates.length}</span>
                  </div>
                  <div className="bg-zinc-800 rounded-full h-1.5">
                    <div
                      className="h-1.5 bg-purple-500 rounded-full transition-all"
                      style={{ width: `${(enrichedCount / candidates.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              {progress && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>Outreach emails</span>
                    <span>{progress.completed}/{progress.total}</span>
                  </div>
                  <div className="bg-zinc-800 rounded-full h-1.5">
                    <div
                      className="h-1.5 bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {columnWarning.length > 0 && (
            <div className="bg-yellow-950/40 border border-yellow-800/60 rounded-lg px-4 py-3 space-y-2.5">
              <div className="text-xs font-semibold text-yellow-400">Column mismatch — scores will be wrong</div>
              <div className="space-y-1">
                <div className="text-xs text-zinc-500">Missing (defaulted to 0):</div>
                <div className="flex flex-wrap gap-1">
                  {columnWarning.map(c => (
                    <span key={c} className="font-mono text-xs text-yellow-500 bg-yellow-950/60 border border-yellow-800/40 rounded px-1.5 py-0.5">{c}</span>
                  ))}
                </div>
              </div>
              {detectedHeaders.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-zinc-500">Your CSV columns:</div>
                  <div className="flex flex-wrap gap-1">
                    {detectedHeaders.map(h => (
                      <span key={h} className="font-mono text-xs text-zinc-400 bg-zinc-800 rounded px-1.5 py-0.5">{h}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-xs text-zinc-600 pt-1 border-t border-yellow-900/40">
                Rename your Clay columns to match exactly: <span className="font-mono text-zinc-500">github_commits_6m · yrs_experience · company_stage · avg_tenure_months · post_topics_match · skills_verified</span>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-950/50 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={handleScore}
            disabled={loading || !candidates.length}
            className="w-full bg-white text-zinc-950 font-semibold py-3 rounded-xl hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            {loading ? 'Scoring…' : `Score ${candidates.length || ''} candidates →`}
          </button>
        </div>

        {/* Right — live results stream */}
        <div className="col-span-3 space-y-3">

          {/* Agent reasoning — appears as soon as selection event fires */}
          {agentSelection && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3 animate-fade-in">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Agent reasoning</div>
              <p className="text-sm text-zinc-300 leading-relaxed">{agentSelection.reasoning}</p>
              {agentSelection.redFlags.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                  <div className="text-xs font-semibold text-yellow-500 uppercase tracking-wider">Red flags</div>
                  {agentSelection.redFlags.map((f, i) => (
                    <div key={i} className="text-xs text-zinc-400">
                      <span className="text-zinc-200 font-medium">{f.name}:</span> {f.flag}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {liveCandidates.length > 0 ? (
            <>
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Live results — {liveCandidates.length} narrated
              </div>
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {liveCandidates.map((c, i) => (
                  <div
                    key={`${i}-${c.name as string}`}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4 animate-fade-in"
                  >
                    <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0">
                      #{c.rank as number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{c.name as string}</span>
                        {(c.is_hidden_gem as boolean) && (
                          <span className="text-xs bg-purple-950 text-purple-400 border border-purple-800/60 rounded-full px-2 py-0.5 shrink-0">
                            gem
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 truncate">
                        {(c.yrs_experience as number)}yr · {c.company_stage as string} · ±{c.uncertainty as number}pts
                        {c.semantic_fit_score != null && (
                          <span className="ml-1 text-purple-400">· fit {c.semantic_fit_score as number}/10</span>
                        )}
                      </div>
                    </div>
                    <div className={`text-2xl font-black tabular-nums shrink-0 ${scoreColor(c.score as number)}`}>
                      {c.score as number}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : loading ? (
            <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">
              Waiting for first results…
            </div>
          ) : candidates.length > 0 ? (
            <div className="flex items-center justify-center h-48 text-zinc-600 text-sm border border-dashed border-zinc-800 rounded-xl">
              Results will stream here as candidates are narrated
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
