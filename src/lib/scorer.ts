// Deterministic scoring engine — Option C
// Accepts dynamic ScoringConfig from the agentic DAG workflow
// Pure TypeScript math — no external deps, fully auditable

export interface RawCandidate {
  name: string
  github_commits_6m: number
  yrs_experience: number
  company_stage: string        // seed|series_a|series_b|series_c|pre_ipo|enterprise
  avg_tenure_months: number
  post_topics_match: number    // 0–10
  skills_verified: number
  // Optional enrichment fields (from digital exhaust layer)
  github_username?:    string
  hn_username?:        string
  semantic_fit_score?: number   // 0–10, overrides post_topics_match when present
  semantic_fit_topics?: string[]
  // Qualitative profile fields (from Clay export — used for outreach personalization)
  headline?:     string   // LinkedIn headline
  summary?:      string   // LinkedIn summary / about section
  job_title?:    string   // Current job title
  company_name?: string   // Current company
}

export interface ScoringConfig {
  weights: {
    github_velocity: number
    experience_depth: number
    stage_fit: number
    skill_evidence: number
    tenure_stability: number
    in_market_signal: number
  }
  causal_edges: {
    stage_suppresses_github: boolean
    stage_github_factors: Record<string, number>
    stage_tenure_factors: Record<string, number>
    reasoning: string
  }
  target_stage: string
  bls_median_tenure: number
  onet_code?: string
  onet_name?: string
  weights_justification?: Record<string, string>
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: {
    github_velocity:   0.28,
    experience_depth:  0.24,
    stage_fit:         0.22,
    skill_evidence:    0.14,
    tenure_stability:  0.07,
    in_market_signal:  0.05,
  },
  causal_edges: {
    stage_suppresses_github: true,
    stage_github_factors: {
      enterprise: 1.40, pre_ipo: 1.20, series_c: 1.10,
      series_b: 1.00,  series_a: 1.00, seed: 0.95,
    },
    stage_tenure_factors: {
      enterprise: 0.75, pre_ipo: 0.88, series_c: 0.94,
      series_b: 1.00,   series_a: 1.00, seed: 1.05,
    },
    reasoning: 'Default O*NET priors for software engineering (15-1252.00). BLS median tenure tech workers: 27mo.',
  },
  target_stage: 'series_b',
  bls_median_tenure: 27,
  onet_code:  '15-1252.00',
  onet_name:  'Software Developers',
  weights_justification: {
    github_velocity:   'O*NET Programming importance 4.88/5',
    experience_depth:  'O*NET Systems Analysis importance 4.75/5',
    stage_fit:         'O*NET Complex Problem Solving importance 4.62/5',
    skill_evidence:    'O*NET Technology Design importance 4.38/5',
    tenure_stability:  'BLS risk signal — tenure stability proxy',
    in_market_signal:  'Active learning proxy — role topic engagement',
  },
}

export interface CausalAdjustment {
  signal: string
  raw: number
  adjusted: number
  factor: number
  reason: string
}

export interface NormalizedSignals {
  github_velocity: number
  experience_depth: number
  stage_fit: number
  tenure_stability: number
  in_market_signal: number
  skill_evidence: number
}

export interface ShapValues {
  github_velocity: number
  experience_depth: number
  stage_fit: number
  tenure_stability: number
  in_market_signal: number
  skill_evidence: number
}

export interface ScoredCandidate extends RawCandidate {
  normalized: NormalizedSignals
  shap: ShapValues
  score: number
  confidence: number
  uncertainty: number
  is_hidden_gem: boolean
  causal_adjustments: CausalAdjustment[]
}

// ─── Causal DAG ────────────────────────────────────────────────────────────────

function applyCausalAdjustments(
  candidate: RawCandidate,
  config: ScoringConfig
): { adjusted: RawCandidate; adjustments: CausalAdjustment[] } {
  const stage = candidate.company_stage.toLowerCase().replace(/[\s-]/g, '_')
  const adjustments: CausalAdjustment[] = []

  let github = candidate.github_commits_6m
  let tenure = candidate.avg_tenure_months

  if (config.causal_edges.stage_suppresses_github) {
    const factor = config.causal_edges.stage_github_factors[stage] ?? 1.0
    if (factor !== 1.0) {
      const adjusted = Math.round(github * factor)
      adjustments.push({
        signal: 'github_commits_6m',
        raw: github,
        adjusted,
        factor,
        reason: `do(stage=series_b): ${stage} causally ${factor > 1 ? 'suppresses' : 'inflates'} public commits (×${factor.toFixed(2)})`,
      })
      github = adjusted
    }
  }

  const tenureFactor = config.causal_edges.stage_tenure_factors[stage] ?? 1.0
  if (tenureFactor !== 1.0) {
    const adjusted = Math.round(tenure * tenureFactor)
    adjustments.push({
      signal: 'avg_tenure_months',
      raw: tenure,
      adjusted,
      factor: tenureFactor,
      reason: `do(stage=series_b): ${stage} tenure norms adjusted (×${tenureFactor.toFixed(2)})`,
    })
    tenure = adjusted
  }

  return {
    adjusted: { ...candidate, github_commits_6m: github, avg_tenure_months: tenure },
    adjustments,
  }
}

// ─── Normalization ─────────────────────────────────────────────────────────────

function minMax(v: number, min: number, max: number): number {
  if (max === min) return 0.5
  return Math.max(0, Math.min(1, (v - min) / (max - min)))
}

function stageDistance(candidateStage: string, targetStage: string): number {
  const ORDER: Record<string, number> = {
    seed: 1, series_a: 2, series_b: 3, series_c: 4, pre_ipo: 5, enterprise: 6,
  }
  const target = ORDER[targetStage] ?? 3
  const candidate = ORDER[candidateStage.toLowerCase().replace(/[\s-]/g, '_')] ?? 3
  const maxDist = Object.keys(ORDER).length - 1
  return 1 - Math.abs(target - candidate) / maxDist
}

function gaussianTenure(months: number, median: number): number {
  return Math.exp(-Math.pow((months - median) / median, 2))
}

// ─── Confidence / Uncertainty ──────────────────────────────────────────────────

function computeConfidence(c: RawCandidate): { confidence: number; uncertainty: number } {
  const signals = [c.github_commits_6m, c.yrs_experience, c.skills_verified, c.post_topics_match, c.avg_tenure_months]
  const stagePresent = c.company_stage && !['unknown', ''].includes(c.company_stage) ? 1 : 0
  const present = signals.filter(v => v > 0).length + stagePresent
  const confidence = Math.round((present / 6) * 100) / 100
  const uncertainty = Math.round((1 - confidence) * 28)
  return { confidence, uncertainty }
}

// ─── Main Scorer ───────────────────────────────────────────────────────────────

export function scoreCandidates(
  candidates: RawCandidate[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): ScoredCandidate[] {
  const causally   = candidates.map(c => applyCausalAdjustments(c, config))
  const adjusted   = causally.map(r => r.adjusted)

  const githubVals = adjusted.map(c => c.github_commits_6m)
  const expVals    = adjusted.map(c => c.yrs_experience)
  const skillVals  = adjusted.map(c => c.skills_verified)

  const [minG, maxG] = [Math.min(...githubVals), Math.max(...githubVals)]
  const [minE, maxE] = [Math.min(...expVals),    Math.max(...expVals)]
  const [minS, maxS] = [Math.min(...skillVals),  Math.max(...skillVals)]

  const w = config.weights

  return adjusted
    .map((c, i) => {
      const { adjustments }       = causally[i]
      const { confidence, uncertainty } = computeConfidence(candidates[i])

      // Use semantic_fit_score (from digital exhaust) when available — more precise than post_topics_match
      const inMarketRaw = candidates[i].semantic_fit_score != null
        ? candidates[i].semantic_fit_score! / 10
        : c.post_topics_match / 10

      const normalized: NormalizedSignals = {
        github_velocity:  minMax(c.github_commits_6m, minG, maxG),
        experience_depth: minMax(c.yrs_experience,    minE, maxE),
        stage_fit:        stageDistance(c.company_stage, config.target_stage),
        tenure_stability: gaussianTenure(c.avg_tenure_months, config.bls_median_tenure),
        in_market_signal: inMarketRaw,
        skill_evidence:   minMax(c.skills_verified, minS, maxS),
      }

      const raw =
        normalized.github_velocity   * w.github_velocity   +
        normalized.experience_depth  * w.experience_depth  +
        normalized.stage_fit         * w.stage_fit         +
        normalized.skill_evidence    * w.skill_evidence    +
        normalized.tenure_stability  * w.tenure_stability  +
        normalized.in_market_signal  * w.in_market_signal

      const score = Math.round(raw * 100)

      const shap: ShapValues = {
        github_velocity:  Math.round(normalized.github_velocity  * w.github_velocity  * 1000) / 10,
        experience_depth: Math.round(normalized.experience_depth * w.experience_depth * 1000) / 10,
        stage_fit:        Math.round(normalized.stage_fit        * w.stage_fit        * 1000) / 10,
        skill_evidence:   Math.round(normalized.skill_evidence   * w.skill_evidence   * 1000) / 10,
        tenure_stability: Math.round(normalized.tenure_stability * w.tenure_stability * 1000) / 10,
        in_market_signal: Math.round(normalized.in_market_signal * w.in_market_signal * 1000) / 10,
      }

      const is_hidden_gem = score >= 60 && confidence < 0.60

      return {
        ...candidates[i],
        normalized,
        shap,
        score,
        confidence,
        uncertainty,
        is_hidden_gem,
        causal_adjustments: adjustments,
      }
    })
    .sort((a, b) => b.score - a.score)
}

// ─── Counterfactual — do(signal = 1.0) ────────────────────────────────────────

export function counterfactual(
  candidate: ScoredCandidate,
  signal: keyof NormalizedSignals,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): number {
  const boosted = { ...candidate.normalized, [signal]: 1.0 }
  const w = config.weights
  const raw =
    boosted.github_velocity   * w.github_velocity   +
    boosted.experience_depth  * w.experience_depth  +
    boosted.stage_fit         * w.stage_fit         +
    boosted.skill_evidence    * w.skill_evidence    +
    boosted.tenure_stability  * w.tenure_stability  +
    boosted.in_market_signal  * w.in_market_signal
  return Math.round(raw * 100)
}

export function biggestGap(candidate: ScoredCandidate): keyof NormalizedSignals {
  const entries = Object.entries(candidate.normalized) as [keyof NormalizedSignals, number][]
  return entries.sort((a, b) => a[1] - b[1])[0][0]
}
