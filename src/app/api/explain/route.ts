// Explainable AI API — single-candidate scoring + explanation
//
// This endpoint is designed to be called from Clay as an enrichment column.
// Unlike /api/score (which scores a full pool), this scores ONE candidate in isolation
// using absolute normalization ranges derived from BLS + O*NET benchmarks.
//
// Clay usage:
//   POST /api/explain
//   Body: { candidate: {...}, jdSummary: "..." }
//
// Returns JSON with score, signal breakdown, causal adjustments,
// hidden gem flag, gap, counterfactual, and a personalized outreach hook.

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import {
  DEFAULT_SCORING_CONFIG,
  type RawCandidate, type ScoringConfig,
  type CausalAdjustment,
} from '@/lib/scorer'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Absolute normalization ranges (BLS / O*NET benchmarks) ───────────────────
// These replace min-max (which needs a pool) for single-candidate scoring.
// Derived from: BLS Occupational Employment Statistics + GitHub Archive data

const BENCHMARKS = {
  github_commits_6m: { min: 0,  p25: 30,  median: 90,  p75: 200, max: 400 },
  yrs_experience:    { min: 0,  p25: 3,   median: 6,   p75: 10,  max: 15  },
  skills_verified:   { min: 0,  p25: 2,   median: 5,   p75: 8,   max: 10  },
}

// Soft sigmoid normalization against benchmark percentiles
function normalizeSoft(value: number, p25: number, median: number, p75: number): number {
  if (value <= 0)       return 0
  if (value >= p75 * 2) return 1
  if (value <= p25)     return (value / p25) * 0.25
  if (value <= median)  return 0.25 + ((value - p25) / (median - p25)) * 0.25
  if (value <= p75)     return 0.50 + ((value - median) / (p75 - median)) * 0.25
  return 0.75 + ((value - p75) / (p75 * 2 - p75)) * 0.25
}

// ─── Stage scoring (same formula as pool scorer) ───────────────────────────────

function stageDistance(candidateStage: string, targetStage: string): number {
  const ORDER: Record<string, number> = {
    seed: 1, series_a: 2, series_b: 3, series_c: 4, pre_ipo: 5, enterprise: 6,
  }
  const target    = ORDER[targetStage] ?? 3
  const candidate = ORDER[candidateStage.toLowerCase().replace(/[\s-]/g, '_')] ?? 3
  return 1 - Math.abs(target - candidate) / (Object.keys(ORDER).length - 1)
}

function gaussianTenure(months: number, median: number): number {
  return Math.exp(-Math.pow((months - median) / median, 2))
}

// ─── Causal adjustments (same as pool scorer) ─────────────────────────────────

function applyCausal(
  candidate: RawCandidate,
  config: ScoringConfig
): { github: number; tenure: number; adjustments: CausalAdjustment[] } {
  const stage = candidate.company_stage.toLowerCase().replace(/[\s-]/g, '_')
  const adjustments: CausalAdjustment[] = []

  let github = candidate.github_commits_6m
  let tenure = candidate.avg_tenure_months

  if (config.causal_edges.stage_suppresses_github) {
    const factor = config.causal_edges.stage_github_factors[stage] ?? 1.0
    if (factor !== 1.0) {
      const adjusted = Math.round(github * factor)
      adjustments.push({
        signal:   'github_commits_6m',
        raw:      github,
        adjusted,
        factor,
        reason:   `do(stage=series_b): ${stage} causally ${factor > 1 ? 'suppresses' : 'inflates'} public commits (×${factor.toFixed(2)})`,
      })
      github = adjusted
    }
  }

  const tenureFactor = config.causal_edges.stage_tenure_factors[stage] ?? 1.0
  if (tenureFactor !== 1.0) {
    const adjusted = Math.round(tenure * tenureFactor)
    adjustments.push({
      signal:   'avg_tenure_months',
      raw:      tenure,
      adjusted,
      factor:   tenureFactor,
      reason:   `do(stage=series_b): ${stage} tenure norms adjusted (×${tenureFactor.toFixed(2)})`,
    })
    tenure = adjusted
  }

  return { github, tenure, adjustments }
}

// ─── Single-candidate scorer ──────────────────────────────────────────────────

interface SignalBreakdown {
  signal:       string
  label:        string
  contribution: number    // SHAP pts (0–100)
  weight:       number    // weight %
  raw:          string    // human-readable raw value
  normalized:   number    // 0–1
  insight:      string    // why this signal matters for this candidate
}

export interface ExplainResult {
  score:              number
  confidence:         number
  uncertainty:        number
  rank_tier:          'excellent' | 'strong' | 'moderate' | 'weak'
  is_hidden_gem:      boolean
  signal_breakdown:   SignalBreakdown[]
  causal_adjustments: CausalAdjustment[]
  gap_signal:         string
  counterfactual_score: number
  explanation:        string   // 3-4 sentence plain English
  gap:                string
  counterfactual:     string
  outreach_hook:      string
}

function scoreCandidate(
  candidate: RawCandidate,
  config: ScoringConfig
): Omit<ExplainResult, 'explanation' | 'gap' | 'counterfactual' | 'outreach_hook'> {
  const { github, tenure, adjustments } = applyCausal(candidate, config)
  const b = BENCHMARKS

  // Use semantic_fit_score if available, else post_topics_match
  const inMarketRaw = candidate.semantic_fit_score != null
    ? candidate.semantic_fit_score / 10
    : candidate.post_topics_match / 10

  const normalized = {
    github_velocity:  normalizeSoft(github,                   b.github_commits_6m.p25, b.github_commits_6m.median, b.github_commits_6m.p75),
    experience_depth: normalizeSoft(candidate.yrs_experience, b.yrs_experience.p25,    b.yrs_experience.median,    b.yrs_experience.p75),
    stage_fit:        stageDistance(candidate.company_stage,  config.target_stage),
    tenure_stability: gaussianTenure(tenure,                  config.bls_median_tenure),
    in_market_signal: inMarketRaw,
    skill_evidence:   normalizeSoft(candidate.skills_verified, b.skills_verified.p25,  b.skills_verified.median,  b.skills_verified.p75),
  }

  const w = config.weights
  const raw =
    normalized.github_velocity   * w.github_velocity   +
    normalized.experience_depth  * w.experience_depth  +
    normalized.stage_fit         * w.stage_fit         +
    normalized.skill_evidence    * w.skill_evidence    +
    normalized.tenure_stability  * w.tenure_stability  +
    normalized.in_market_signal  * w.in_market_signal

  const score = Math.round(raw * 100)

  // SHAP (exact for linear model)
  const shap = {
    github_velocity:  Math.round(normalized.github_velocity  * w.github_velocity  * 1000) / 10,
    experience_depth: Math.round(normalized.experience_depth * w.experience_depth * 1000) / 10,
    stage_fit:        Math.round(normalized.stage_fit        * w.stage_fit        * 1000) / 10,
    skill_evidence:   Math.round(normalized.skill_evidence   * w.skill_evidence   * 1000) / 10,
    tenure_stability: Math.round(normalized.tenure_stability * w.tenure_stability * 1000) / 10,
    in_market_signal: Math.round(normalized.in_market_signal * w.in_market_signal * 1000) / 10,
  }

  // Confidence
  const signals = [candidate.github_commits_6m, candidate.yrs_experience, candidate.skills_verified, candidate.post_topics_match, candidate.avg_tenure_months]
  const stageOk = candidate.company_stage && !['unknown', ''].includes(candidate.company_stage) ? 1 : 0
  const confidence = Math.round(((signals.filter(v => v > 0).length + stageOk) / 6) * 100) / 100
  const uncertainty = Math.round((1 - confidence) * 28)

  // Signal breakdown with human-readable values
  const LABELS: Record<string, string> = {
    github_velocity:  'GitHub velocity',
    experience_depth: 'Experience depth',
    stage_fit:        'Stage fit',
    skill_evidence:   'Skill evidence',
    tenure_stability: 'Tenure stability',
    in_market_signal: 'In-market signal',
  }

  const RAW_VALUES: Record<string, string> = {
    github_velocity:  `${candidate.github_commits_6m} commits/6mo${adjustments.find(a => a.signal === 'github_commits_6m') ? ` → ${adjustments.find(a => a.signal === 'github_commits_6m')!.adjusted} adjusted` : ''}`,
    experience_depth: `${candidate.yrs_experience} years`,
    stage_fit:        candidate.company_stage,
    skill_evidence:   `${candidate.skills_verified} verified`,
    tenure_stability: `${candidate.avg_tenure_months} months avg tenure`,
    in_market_signal: candidate.semantic_fit_score != null ? `${candidate.semantic_fit_score}/10 semantic fit` : `${candidate.post_topics_match}/10 topics`,
  }

  const INSIGHTS: Record<string, string> = {
    github_velocity:  normalized.github_velocity  >= 0.7 ? 'Above-benchmark commit velocity — strong execution signal' : normalized.github_velocity >= 0.4 ? 'Mid-range GitHub activity' : 'Below benchmark — may be at private-repo company (check causal adjustment)',
    experience_depth: normalized.experience_depth >= 0.7 ? 'Senior-level tenure depth' : normalized.experience_depth >= 0.4 ? 'Mid-level experience band' : 'Early-career — weigh alongside skill evidence',
    stage_fit:        normalized.stage_fit        >= 0.8 ? 'Near-perfect stage match — worked in your exact growth stage' : normalized.stage_fit >= 0.6 ? 'Adjacent stage — workable fit' : 'Stage mismatch — culture adjustment risk',
    skill_evidence:   normalized.skill_evidence   >= 0.7 ? 'Strong verified skill evidence — not just listed, demonstrated' : normalized.skill_evidence >= 0.4 ? 'Moderate demonstrated skills' : 'Thin skill evidence — needs deeper vetting',
    tenure_stability: normalized.tenure_stability >= 0.7 ? 'Optimal tenure range — not a job-hopper, not stale' : tenure < 12 ? 'Short tenures — may indicate job-hopping risk' : 'Longer tenures — may have trouble adapting to fast pace',
    in_market_signal: normalized.in_market_signal >= 0.7 ? 'Actively engaged with relevant topics — likely exploring opportunities' : normalized.in_market_signal >= 0.3 ? 'Some relevant topic engagement' : 'Low in-market signal — may be passive or not on LinkedIn/HN',
  }

  const signal_breakdown: SignalBreakdown[] = Object.entries(shap)
    .sort((a, b) => b[1] - a[1])
    .map(([signal, contribution]) => ({
      signal,
      label:       LABELS[signal],
      contribution,
      weight:      Math.round(w[signal as keyof typeof w] * 100),
      raw:         RAW_VALUES[signal],
      normalized:  Math.round((normalized[signal as keyof typeof normalized]) * 100) / 100,
      insight:     INSIGHTS[signal],
    }))

  // Gap — weakest signal
  const gapEntry = Object.entries(normalized).sort((a, b) => a[1] - b[1])[0]
  const gap_signal = gapEntry[0]

  // Counterfactual: score with gap signal set to 0.8 (achievable, not perfect)
  const boosted = { ...normalized, [gap_signal]: 0.8 }
  const boostedRaw =
    boosted.github_velocity   * w.github_velocity   +
    boosted.experience_depth  * w.experience_depth  +
    boosted.stage_fit         * w.stage_fit         +
    boosted.skill_evidence    * w.skill_evidence    +
    boosted.tenure_stability  * w.tenure_stability  +
    boosted.in_market_signal  * w.in_market_signal
  const counterfactual_score = Math.round(boostedRaw * 100)

  const rank_tier: ExplainResult['rank_tier'] =
    score >= 75 ? 'excellent' : score >= 60 ? 'strong' : score >= 45 ? 'moderate' : 'weak'

  const is_hidden_gem = score >= 55 && confidence < 0.60

  return {
    score, confidence, uncertainty, rank_tier, is_hidden_gem,
    signal_breakdown, causal_adjustments: adjustments,
    gap_signal, counterfactual_score,
  }
}

// ─── LLM narration for explanation + outreach hook ────────────────────────────

async function narrateExplanation(
  candidate: RawCandidate,
  breakdown: Omit<ExplainResult, 'explanation' | 'gap' | 'counterfactual' | 'outreach_hook'>,
  jdSummary: string
): Promise<{ explanation: string; gap: string; counterfactual: string; outreach_hook: string }> {
  const topDrivers  = breakdown.signal_breakdown.slice(0, 3).map(s => `${s.label}: +${s.contribution}pts (${s.insight})`)
  const gapLabel    = breakdown.signal_breakdown.find(s => s.signal === breakdown.gap_signal)?.label ?? breakdown.gap_signal.replace(/_/g, ' ')
  const causalNotes = breakdown.causal_adjustments.length
    ? breakdown.causal_adjustments.map(a => `${a.signal} ${a.raw}→${a.adjusted} (${a.reason.split(':')[0]})`).join('; ')
    : 'none'

  const prompt = `You are an expert recruiter explaining a candidate's algorithmic score.

Role: ${jdSummary.slice(0, 400)}

Candidate: ${candidate.name}
Score: ${breakdown.score}/100 | Tier: ${breakdown.rank_tier} | Confidence: ${Math.round(breakdown.confidence * 100)}%
${breakdown.is_hidden_gem ? '⚠ HIDDEN GEM: Strong signals but thin data — worth a call\n' : ''}
Top drivers: ${topDrivers.join(' | ')}
Causal adjustments: ${causalNotes}
Biggest gap: ${gapLabel} — counterfactual: ${breakdown.score}→${breakdown.counterfactual_score} if improved

Write exactly 4 JSON fields:
1. "explanation": 3 sentences explaining WHY this score. Mention specific signals. Causal, not fluffy.
2. "gap": 1 sentence — the single biggest weakness for THIS role specifically.
3. "counterfactual": 1 sentence — what would change their ranking if gap improved.
4. "outreach_hook": 1 sentence personalized hook for a cold email. Reference something specific (their stage, tenure pattern, commit behavior). Do NOT start with "I".

Return ONLY valid JSON: {"explanation":"...","gap":"...","counterfactual":"...","outreach_hook":"..."}`

  try {
    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages:   [{ role: 'user', content: prompt }],
    })
    const text  = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const start = text.indexOf('{')
    const end   = text.lastIndexOf('}')
    const parsed = JSON.parse(text.slice(start, end + 1))
    return {
      explanation:   parsed.explanation   ?? `${candidate.name} scored ${breakdown.score}/100 (${breakdown.rank_tier} tier).`,
      gap:           parsed.gap           ?? `Weakest signal: ${gapLabel}`,
      counterfactual: parsed.counterfactual ?? `Score could reach ${breakdown.counterfactual_score} if ${gapLabel} improves.`,
      outreach_hook: parsed.outreach_hook ?? `Your ${candidate.yrs_experience} years at ${candidate.company_stage}-stage companies aligns with what we're building.`,
    }
  } catch {
    return {
      explanation:    `${candidate.name} scored ${breakdown.score}/100 in the ${breakdown.rank_tier} tier based on ${breakdown.signal_breakdown.slice(0,2).map(s => s.label.toLowerCase()).join(' and ')}.`,
      gap:            `Lowest signal: ${gapLabel}`,
      counterfactual: `Score would reach ${breakdown.counterfactual_score} if ${gapLabel} improves to p75 benchmark.`,
      outreach_hook:  `Your background at a ${candidate.company_stage}-stage company is exactly the experience we're looking for.`,
    }
  }
}

// ─── Route handlers ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Optional API key check (set EXPLAIN_API_KEY in env; skip check if not set)
  const apiKey = process.env.EXPLAIN_API_KEY
  if (apiKey) {
    const provided = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace('Bearer ', '')
    if (provided !== apiKey) {
      return Response.json({ error: 'Unauthorized — provide x-api-key header' }, { status: 401 })
    }
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { candidate, jdSummary, scoringConfig } = body as {
    candidate:      RawCandidate
    jdSummary?:     string
    scoringConfig?: ScoringConfig
  }

  if (!candidate?.name) {
    return Response.json({ error: 'candidate.name is required' }, { status: 400 })
  }

  const config = scoringConfig ?? DEFAULT_SCORING_CONFIG
  const jd     = jdSummary ?? ''

  // Normalize candidate fields
  const normalized: RawCandidate = {
    name:              candidate.name,
    github_commits_6m: Number(candidate.github_commits_6m ?? 0),
    yrs_experience:    Number(candidate.yrs_experience    ?? 0),
    company_stage:     String(candidate.company_stage     ?? 'series_b').toLowerCase().replace(/[\s-]/g, '_'),
    avg_tenure_months: Number(candidate.avg_tenure_months ?? 0),
    post_topics_match: Number(candidate.post_topics_match ?? 0),
    skills_verified:   Number(candidate.skills_verified   ?? 0),
    github_username:   candidate.github_username,
    semantic_fit_score:  candidate.semantic_fit_score,
    semantic_fit_topics: candidate.semantic_fit_topics,
  }

  const breakdown = scoreCandidate(normalized, config)

  // Generate LLM narration (skip if no API key set — return structural data only)
  let narration: Pick<ExplainResult, 'explanation' | 'gap' | 'counterfactual' | 'outreach_hook'>

  if (process.env.ANTHROPIC_API_KEY) {
    narration = await narrateExplanation(normalized, breakdown, jd)
  } else {
    const gapLabel = breakdown.gap_signal.replace(/_/g, ' ')
    narration = {
      explanation:    `${normalized.name} scored ${breakdown.score}/100 (${breakdown.rank_tier} tier). Top drivers: ${breakdown.signal_breakdown.slice(0,2).map(s => s.label).join(', ')}.`,
      gap:            `Lowest signal: ${gapLabel} at ${Math.round(breakdown.signal_breakdown.find(s => s.signal === breakdown.gap_signal)?.normalized ?? 0 * 100)}%.`,
      counterfactual: `Score would reach ${breakdown.counterfactual_score} if ${gapLabel} improves to 80th percentile benchmark.`,
      outreach_hook:  `Your ${normalized.yrs_experience}yr background at ${normalized.company_stage}-stage companies maps directly to what we need.`,
    }
  }

  const result: ExplainResult = { ...breakdown, ...narration }

  return Response.json(result)
}

// GET — returns API spec for integration guide
export async function GET() {
  return Response.json({
    name:        'Barcelona Explain API',
    version:     '1.0',
    description: 'Single-candidate explainability endpoint. Score one candidate against a JD with full SHAP decomposition, causal adjustments, and personalized insights.',
    endpoint:    'POST /api/explain',
    auth:        'Optional: x-api-key header (set EXPLAIN_API_KEY env var to require auth)',
    body: {
      candidate: {
        name:              'string (required)',
        github_commits_6m: 'number',
        yrs_experience:    'number',
        company_stage:     'seed|series_a|series_b|series_c|pre_ipo|enterprise',
        avg_tenure_months: 'number',
        post_topics_match: 'number (0–10)',
        skills_verified:   'number',
        github_username:   'string (optional — enables semantic fit)',
        semantic_fit_score: 'number (optional — overrides post_topics_match)',
      },
      jdSummary:     'string (optional — job description for context-aware narration)',
      scoringConfig: 'object (optional — use your agent-derived config)',
    },
    response: {
      score:              'number 0–100',
      confidence:         'number 0–1 (fraction of signals with real data)',
      uncertainty:        'number (±pts uncertainty)',
      rank_tier:          'excellent|strong|moderate|weak',
      is_hidden_gem:      'boolean',
      signal_breakdown:   'array of { signal, label, contribution, weight, raw, normalized, insight }',
      causal_adjustments: 'array of { signal, raw, adjusted, factor, reason }',
      gap_signal:         'string (weakest signal key)',
      counterfactual_score: 'number (score if gap fixed to p75)',
      explanation:        'string (3-sentence plain English explanation)',
      gap:                'string (biggest weakness)',
      counterfactual:     'string (what would change their ranking)',
      outreach_hook:      'string (personalized email opener)',
    },
    clay_column_prompt: `Make a POST request to https://YOUR_DOMAIN/api/explain with this JSON body:
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
}
Return the full JSON response. Use the explanation field for the candidate summary column.`,
  })
}
