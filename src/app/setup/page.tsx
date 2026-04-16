'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface SetupData {
  roleAnalysis: {
    role_type: string; onet_code: string; onet_name: string
    seniority: string; is_technical: boolean; key_requirements: string[]; confidence: number
  }
  scoringConfig: {
    weights: Record<string, number>
    causal_edges: {
      reasoning: string
      stage_suppresses_github: boolean
      stage_github_factors: Record<string, number>
      stage_tenure_factors: Record<string, number>
    }
    onet_code: string; onet_name: string
    weights_justification?: Record<string, string>
  }
  claySetup: {
    search_filters: {
      titles: string[]; keywords: string[]
      seniority_levels: string[]; company_size_hint: string
    }
    clay_prompts: Record<string, string>
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button onClick={copy} className="text-xs text-zinc-500 hover:text-zinc-300 shrink-0 transition-colors">
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

interface WeightTooltipProps {
  signal: string
  weight: number
  justification?: string
}
function WeightTooltip({ signal, weight, justification }: WeightTooltipProps) {
  const source = SIGNAL_SOURCE[signal]
  return (
    <div className="relative group">
      <button className="w-4 h-4 rounded-full border border-zinc-700 text-zinc-600 hover:text-zinc-300 hover:border-zinc-500 flex items-center justify-center text-xs transition-colors leading-none">
        i
      </button>
      {/* Tooltip */}
      <div className="absolute right-0 top-6 z-50 w-72 bg-zinc-800 border border-zinc-700 rounded-xl p-3 space-y-2 shadow-xl
                      invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-150 pointer-events-none">
        <div className="text-xs font-semibold text-zinc-200 capitalize">{signal.replace(/_/g, ' ')}</div>
        {source && (
          <div className="text-xs text-zinc-400 leading-relaxed border-b border-zinc-700 pb-2">{source}</div>
        )}
        {justification && (
          <div className="text-xs text-indigo-400 leading-relaxed">{justification}</div>
        )}
        <div className="font-mono text-xs text-zinc-500 bg-zinc-900 rounded px-2 py-1.5 space-y-0.5">
          <div>normalize({signal})</div>
          <div className="text-zinc-600">× {weight.toFixed(2)} (weight)</div>
          <div className="text-zinc-600">× 100</div>
          <div className="text-zinc-400 border-t border-zinc-700 pt-1 mt-1">= SHAP contribution (0–{Math.round(weight * 100)}pts max)</div>
        </div>
      </div>
    </div>
  )
}

const SIGNAL_LABELS: Record<string, string> = {
  github_commits_6m:  'GitHub commits (6mo)',
  yrs_experience:     'Years of experience',
  company_stage:      'Company stage',
  avg_tenure_months:  'Avg tenure (months)',
  post_topics_match:  'Post topics match (0-10)',
  skills_verified:    'Verified skills count',
}

const SIGNAL_SOURCE: Record<string, string> = {
  github_velocity:  'Source: github_commits_6m — min-max normalized across pool, then causal stage adjustment applied',
  experience_depth: 'Source: yrs_experience — min-max normalized across pool',
  stage_fit:        'Source: company_stage — structural distance on funding lifecycle (seed → enterprise), 0 = opposite end, 1 = exact match',
  skill_evidence:   'Source: skills_verified — min-max normalized; counts DEMONSTRATED skills, not listed',
  tenure_stability: 'Source: avg_tenure_months — Gaussian centered on BLS median (27mo); penalty both for job-hopping and stagnation',
  in_market_signal: 'Source: semantic_fit_score (if GitHub enriched) or post_topics_match ÷ 10 — proxy for active role engagement',
}

function buildSculptorPrompt(data: SetupData, jd: string): string {
  const { roleAnalysis, scoringConfig, claySetup } = data
  const titles   = claySetup.search_filters.titles.join(', ')
  const keywords = claySetup.search_filters.keywords.join(', ')
  const seniority = claySetup.search_filters.seniority_levels.join(', ')
  const stage    = scoringConfig.target_stage.replace(/_/g, ' ')
  const skills   = roleAnalysis.key_requirements.slice(0, 6).join(', ')

  return `I'm hiring for this role:

${jd.slice(0, 600)}${jd.length > 600 ? '...' : ''}

Set up a Clay table to find the best candidates. Here's exactly what I need:

SEARCH FILTERS:
- Job titles: ${titles}
- Keywords: ${keywords}
- Seniority: ${seniority}
- Company stage: ${stage} stage startups (${claySetup.search_filters.company_size_hint}). No enterprise, no agencies, no consulting firms.

ENRICHMENT — add one AI column called "ai_enrichment" that researches each person and returns ONLY this raw JSON object:

{
  "github_commits_6m": <number — total public GitHub commits in the last 6 months, 0 if not found>,
  "yrs_experience": <number — total years of professional ${roleAnalysis.role_type} experience>,
  "company_stage": <string — exactly one of: seed, series_a, series_b, series_c, pre_ipo, enterprise>,
  "avg_tenure_months": <number — average job duration across their last 3 positions in months>,
  "post_topics_match": <number 0–10 — count of last 10 LinkedIn posts mentioning: ${skills}>,
  "skills_verified": <number — count of skills DEMONSTRATED through shipped projects, open source, or measurable outcomes. Focus on: ${skills}. Do NOT count skills merely listed on profile>
}

Return ONLY the raw JSON. No explanation, no markdown.

FORMULA COLUMNS — after the AI column, add one formula column per field to extract each value:
{{ai_enrichment.github_commits_6m}}, {{ai_enrichment.yrs_experience}}, {{ai_enrichment.company_stage}}, {{ai_enrichment.avg_tenure_months}}, {{ai_enrichment.post_topics_match}}, {{ai_enrichment.skills_verified}}

EXPORT — the final CSV must have these exact column names:
name, github_commits_6m, yrs_experience, company_stage, avg_tenure_months, post_topics_match, skills_verified`
}

function buildSinglePrompt(keyRequirements: string[]): string {
  const skills = keyRequirements.slice(0, 6).join(', ') || 'backend development, API design, system architecture'
  return `Research this person thoroughly and return ONLY a raw JSON object with exactly these fields:

{
  "github_commits_6m": <number — total public GitHub commits in the last 6 months, 0 if not found>,
  "yrs_experience": <number — total years of professional software engineering experience from LinkedIn>,
  "company_stage": <string — current employer stage, exactly one of: seed, series_a, series_b, series_c, pre_ipo, enterprise. Use enterprise for public companies or 1000+ employees>,
  "avg_tenure_months": <number — average job duration across their last 3 positions in months>,
  "post_topics_match": <number 0–10 — count of last 10 LinkedIn posts mentioning: ${skills}>,
  "skills_verified": <number — count of skills DEMONSTRATED through shipped projects, open source, blog posts, or measurable outcomes. Focus on: ${skills}. Do NOT count skills merely listed on profile>
}

Return ONLY the raw JSON object. No explanation, no markdown.`
}

export default function SetupPage() {
  const router = useRouter()
  const [data,        setData]        = useState<SetupData | null>(null)
  const [promptMode,  setPromptMode]  = useState<'single' | 'multi'>('single')
  const [generating,  setGenerating]  = useState(false)
  const [genError,    setGenError]    = useState('')

  async function handleGenerate() {
    if (!data) return
    setGenerating(true)
    setGenError('')
    try {
      const jd = sessionStorage.getItem('barcelona_jd') ?? ''
      const res = await fetch('/api/generate-candidates', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jdSummary:    jd,
          roleAnalysis:  data.roleAnalysis,
          scoringConfig: data.scoringConfig,
        }),
      })
      const result = await res.json() as { candidates?: unknown[]; error?: string }
      if (!res.ok || result.error) throw new Error(result.error ?? 'Generation failed')
      sessionStorage.setItem('barcelona_generated_candidates', JSON.stringify(result.candidates))
      router.push('/score')
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    const raw = sessionStorage.getItem('barcelona_setup')
    if (!raw) { router.push('/analyze'); return }
    setData(JSON.parse(raw))
  }, [router])

  if (!data) return null

  const { roleAnalysis, scoringConfig, claySetup } = data
  const weightEntries = Object.entries(scoringConfig.weights).sort((a, b) => b[1] - a[1])
  const jd = typeof window !== 'undefined' ? sessionStorage.getItem('barcelona_jd') ?? '' : ''
  const sculptorPrompt = buildSculptorPrompt(data, jd)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Clay setup instructions</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Copy these prompts into Clay. Then export your CSV and upload it to score.
          </p>
        </div>
        <button
          onClick={() => router.push('/score')}
          className="bg-white text-zinc-950 font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-zinc-100 transition-colors shrink-0"
        >
          I have my CSV →
        </button>
      </div>

      {/* Sculptor prompt — paste this into Clay */}
      <div className="bg-indigo-950/40 border border-indigo-800/50 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-indigo-300">Clay Sculptor prompt</div>
            <div className="text-xs text-zinc-500">Paste this into Sculptor → it configures search filters + AI enrichment column automatically.</div>
          </div>
          <CopyButton text={sculptorPrompt} />
        </div>
        <pre className="text-xs text-zinc-300 bg-zinc-900/80 rounded-lg p-3 overflow-x-auto leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
          {sculptorPrompt}
        </pre>
      </div>

      {/* Role analysis */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Role identified</div>
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <div className="text-white font-semibold">{roleAnalysis.onet_name}</div>
            <div className="text-zinc-500 text-sm">{roleAnalysis.onet_code} · {roleAnalysis.seniority} · {roleAnalysis.role_type}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs text-zinc-600">Agent confidence</div>
            <div className="text-sm font-mono text-zinc-300">{Math.round(roleAnalysis.confidence * 100)}%</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {roleAnalysis.key_requirements.map((r, i) => (
            <span key={i} className="text-xs bg-zinc-800 text-zinc-300 rounded-full px-2.5 py-1">{r}</span>
          ))}
        </div>
      </div>

      {/* Weights */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Scoring weights (agent-derived)</div>
          <div className="text-xs font-mono text-zinc-600">{scoringConfig.onet_code}</div>
        </div>

        {/* Per-signal weight bars + tooltip */}
        <div className="space-y-2">
          {weightEntries.map(([signal, weight]) => (
            <div key={signal} className="flex items-center gap-3">
              <div className="w-36 text-xs text-zinc-400 shrink-0">{signal.replace(/_/g, ' ')}</div>
              <div className="flex-1 bg-zinc-800 rounded-full h-2">
                <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${weight * 100}%` }} />
              </div>
              <div className="text-xs font-mono text-zinc-400 w-10 text-right shrink-0">
                {Math.round(weight * 100)}%
              </div>
              <WeightTooltip
                signal={signal}
                weight={weight}
                justification={scoringConfig.weights_justification?.[signal]}
              />
            </div>
          ))}
        </div>

        {/* Causal DAG — stage correction factors */}
        {scoringConfig.causal_edges.stage_suppresses_github && (
          <div className="border-t border-zinc-800 pt-4 space-y-3">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Causal DAG — stage correction factors
            </div>
            <div className="text-xs text-zinc-500 leading-relaxed">
              {scoringConfig.causal_edges.reasoning}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* GitHub multipliers */}
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">GitHub commits ×</div>
                <div className="space-y-1">
                  {Object.entries(scoringConfig.causal_edges.stage_github_factors)
                    .sort((a, b) => b[1] - a[1])
                    .map(([stage, factor]) => (
                      <div key={stage} className="flex items-center justify-between bg-zinc-800/60 rounded px-2.5 py-1">
                        <span className="text-xs text-zinc-400 font-mono">{stage}</span>
                        <span className={`text-xs font-mono font-bold ${
                          factor > 1 ? 'text-emerald-400' : factor < 1 ? 'text-red-400' : 'text-zinc-500'
                        }`}>
                          ×{factor.toFixed(2)}
                        </span>
                      </div>
                    ))}
                </div>
                <div className="text-xs text-zinc-700 leading-relaxed">
                  Enterprise/pre-IPO candidates work in private repos — raw commit count undersells them. Multiplier corrects for this.
                </div>
              </div>
              {/* Tenure multipliers */}
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">Tenure norms ×</div>
                <div className="space-y-1">
                  {Object.entries(scoringConfig.causal_edges.stage_tenure_factors)
                    .sort((a, b) => b[1] - a[1])
                    .map(([stage, factor]) => (
                      <div key={stage} className="flex items-center justify-between bg-zinc-800/60 rounded px-2.5 py-1">
                        <span className="text-xs text-zinc-400 font-mono">{stage}</span>
                        <span className={`text-xs font-mono font-bold ${
                          factor > 1 ? 'text-emerald-400' : factor < 1 ? 'text-red-400' : 'text-zinc-500'
                        }`}>
                          ×{factor.toFixed(2)}
                        </span>
                      </div>
                    ))}
                </div>
                <div className="text-xs text-zinc-700 leading-relaxed">
                  Seed-stage tenure is naturally shorter. Enterprise tenure is longer but less meaningful here. Gaussian penalty applied around BLS median.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Score formula */}
        <div className="border-t border-zinc-800 pt-3">
          <div className="text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-2">Score formula</div>
          <div className="font-mono text-xs text-zinc-500 bg-zinc-800/50 rounded-lg px-3 py-2 leading-relaxed">
            score = Σ ( normalize(signal) × weight ) × 100
          </div>
          <div className="font-mono text-xs text-zinc-700 bg-zinc-800/50 rounded-lg px-3 py-1.5 mt-1 leading-relaxed">
            {weightEntries.map(([s, w]) => `${s.split('_')[0]}(${Math.round(w*100)}%)`).join(' + ')} = 100pts
          </div>
        </div>
      </div>

      {/* Search filters */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Clay search filters</div>
          <CopyButton text={[
            'Titles: ' + claySetup.search_filters.titles.join(', '),
            'Keywords: ' + claySetup.search_filters.keywords.join(', '),
            'Seniority: ' + claySetup.search_filters.seniority_levels.join(', '),
            'Company size: ' + claySetup.search_filters.company_size_hint,
          ].join('\n')} />
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-zinc-500 text-xs mb-1.5">Job titles</div>
            <div className="space-y-1">
              {claySetup.search_filters.titles.map((t, i) => (
                <div key={i} className="text-zinc-300">{t}</div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-zinc-500 text-xs mb-1.5">Keywords</div>
            <div className="flex flex-wrap gap-1.5">
              {claySetup.search_filters.keywords.map((k, i) => (
                <span key={i} className="text-xs bg-zinc-800 text-zinc-300 rounded px-2 py-0.5">{k}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-zinc-500 text-xs mb-1.5">Seniority</div>
            <div className="text-zinc-300">{claySetup.search_filters.seniority_levels.join(', ')}</div>
          </div>
          <div>
            <div className="text-zinc-500 text-xs mb-1.5">Company size</div>
            <div className="text-zinc-300">{claySetup.search_filters.company_size_hint}</div>
          </div>
        </div>
      </div>

      {/* Clay AI column prompts */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Clay AI column prompts</div>
          <div className="flex gap-1 text-xs">
            <span className="text-zinc-600">Choose:</span>
            <button
              onClick={() => setPromptMode('single')}
              className={`px-2 py-0.5 rounded transition-colors ${promptMode === 'single' ? 'bg-white text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'}`}
            >
              Single prompt
            </button>
            <button
              onClick={() => setPromptMode('multi')}
              className={`px-2 py-0.5 rounded transition-colors ${promptMode === 'multi' ? 'bg-white text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'}`}
            >
              6 columns
            </button>
          </div>
        </div>

        {promptMode === 'single' ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-sm font-medium text-zinc-200">All signals — 1 AI column</div>
                <div className="text-xs text-zinc-500">Returns JSON with all 6 fields. Use formula columns to extract each value. <span className="text-emerald-400">Uses 1 credit per row instead of 6.</span></div>
              </div>
              <CopyButton text={buildSinglePrompt(roleAnalysis.key_requirements)} />
            </div>
            <pre className="text-xs text-zinc-300 bg-zinc-800/60 rounded-lg p-3 overflow-x-auto leading-relaxed whitespace-pre-wrap">
              {buildSinglePrompt(roleAnalysis.key_requirements)}
            </pre>
            <div className="space-y-1.5 pt-1 border-t border-zinc-800">
              <div className="text-xs text-zinc-500 font-semibold">Then add formula columns to extract each field:</div>
              <div className="grid grid-cols-2 gap-1">
                {['github_commits_6m', 'yrs_experience', 'company_stage', 'avg_tenure_months', 'post_topics_match', 'skills_verified'].map(f => (
                  <div key={f} className="font-mono text-xs text-zinc-400 bg-zinc-800 rounded px-2 py-1">
                    {'{{ai_column.'}{f}{'}}'}
                  </div>
                ))}
              </div>
              <div className="text-xs text-zinc-600">Replace <span className="font-mono text-zinc-500">ai_column</span> with the name of your single AI column.</div>
            </div>
          </div>
        ) : (
          Object.entries(claySetup.clay_prompts).map(([key, prompt]) => (
            <div key={key} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-200">
                  {SIGNAL_LABELS[key] ?? key}
                  <span className="ml-2 text-xs font-mono text-zinc-600">→ column: {key}</span>
                </div>
                <CopyButton text={prompt} />
              </div>
              <div className="text-sm text-zinc-400 leading-relaxed bg-zinc-800/50 rounded-lg p-3 font-mono text-xs">
                {prompt}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Explain API — Clay integration */}
      <div className="space-y-3">
        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Explain API — per-candidate scoring directly in Clay
        </div>
        <div className="bg-zinc-900 border border-indigo-800/40 rounded-xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5 shrink-0" />
            <div className="space-y-1">
              <div className="text-sm font-medium text-white">Add an HTTP column in Clay</div>
              <div className="text-xs text-zinc-400 leading-relaxed">
                Call <span className="font-mono text-indigo-300">POST /api/explain</span> from a Clay HTTP enrichment column.
                Returns a score, SHAP breakdown, gap analysis, and a personalized outreach hook — for every row in your Clay table.
              </div>
            </div>
          </div>

          {/* Step 1 — HTTP column prompt */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Step 1 — Clay HTTP column body</div>
              <CopyButton text={`POST https://YOUR_DOMAIN/api/explain

{
  "candidate": {
    "name": "{{full_name}}",
    "github_commits_6m": {{github_commits_6m}},
    "yrs_experience": {{yrs_experience}},
    "company_stage": "{{company_stage}}",
    "avg_tenure_months": {{avg_tenure_months}},
    "post_topics_match": {{post_topics_match}},
    "skills_verified": {{skills_verified}}
  },
  "jdSummary": "PASTE YOUR JD HERE"
}`} />
            </div>
            <pre className="text-xs text-zinc-300 bg-zinc-800 rounded-lg px-3 py-3 overflow-x-auto leading-relaxed">{`POST https://YOUR_DOMAIN/api/explain

{
  "candidate": {
    "name": "{{full_name}}",
    "github_commits_6m": {{github_commits_6m}},
    "yrs_experience": {{yrs_experience}},
    "company_stage": "{{company_stage}}",
    "avg_tenure_months": {{avg_tenure_months}},
    "post_topics_match": {{post_topics_match}},
    "skills_verified": {{skills_verified}}
  },
  "jdSummary": "PASTE YOUR JD HERE"
}`}</pre>
          </div>

          {/* Step 2 — response fields */}
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Step 2 — map response fields to Clay columns</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { field: '.score',               label: 'Score (0–100)',          color: 'text-emerald-400' },
                { field: '.rank_tier',            label: 'Tier (excellent…weak)',  color: 'text-zinc-300' },
                { field: '.explanation',          label: 'Why this score',         color: 'text-zinc-300' },
                { field: '.outreach_hook',        label: 'Cold email opener',      color: 'text-indigo-300' },
                { field: '.gap',                  label: 'Biggest weakness',       color: 'text-zinc-300' },
                { field: '.counterfactual',       label: 'What would change rank', color: 'text-zinc-300' },
                { field: '.is_hidden_gem',        label: 'Hidden gem flag',        color: 'text-purple-400' },
                { field: '.counterfactual_score', label: 'Potential score',        color: 'text-zinc-300' },
              ].map(({ field, label, color }) => (
                <div key={field} className="flex items-center gap-2 bg-zinc-800/60 rounded-lg px-2.5 py-1.5">
                  <span className={`font-mono text-xs ${color}`}>{field}</span>
                  <span className="text-zinc-500 text-xs">— {label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-zinc-600 border-t border-zinc-800 pt-3">
            Replace <span className="font-mono text-zinc-500">YOUR_DOMAIN</span> with your deployed app URL (Vercel, Railway, etc.).
            If you set <span className="font-mono text-zinc-500">EXPLAIN_API_KEY</span> in env, add header <span className="font-mono text-zinc-500">x-api-key: YOUR_KEY</span> to the Clay column.
          </div>
        </div>
      </div>

      {/* CSV schema */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Required CSV columns</div>
          <CopyButton text="name,github_commits_6m,yrs_experience,company_stage,avg_tenure_months,post_topics_match,skills_verified,github_username" />
        </div>
        <div className="font-mono text-xs text-zinc-300 bg-zinc-800 rounded-lg px-3 py-2">
          name, github_commits_6m, yrs_experience, company_stage, avg_tenure_months, post_topics_match, skills_verified,{' '}
          <span className="text-purple-400">github_username</span>
          <span className="text-zinc-600 ml-2">(optional — enables semantic fit scoring)</span>
        </div>
      </div>

      {genError && (
        <div className="bg-red-950/50 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400">
          {genError}
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={generating}
        className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {generating ? 'Generating candidates…' : 'Generate 12 test candidates & score →'}
      </button>

      <button
        onClick={() => router.push('/score')}
        className="w-full bg-zinc-800 text-zinc-300 font-medium py-2.5 rounded-xl hover:bg-zinc-700 transition-colors text-sm"
      >
        I already have a CSV →
      </button>
    </div>
  )
}
