// Agentic DAG workflow — 3 sequential Claude calls that build the scoring config
// Each call produces structured JSON used by the next step and the deterministic scorer

import Anthropic from '@anthropic-ai/sdk'
import type { ScoringConfig } from './scorer'
import { DEFAULT_SCORING_CONFIG } from './scorer'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface RoleAnalysis {
  role_type: 'engineering' | 'sales' | 'design' | 'marketing' | 'ops' | 'finance' | 'other'
  onet_code: string
  onet_name: string
  seniority: 'junior' | 'mid' | 'senior' | 'lead' | 'executive'
  is_technical: boolean
  key_requirements: string[]
  confidence: number
}

export interface ClaySetup {
  search_filters: {
    titles: string[]
    keywords: string[]
    seniority_levels: string[]
    company_size_hint: string
  }
  clay_prompts: {
    github_commits_6m: string
    yrs_experience: string
    company_stage: string
    avg_tenure_months: string
    post_topics_match: string
    skills_verified: string
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function callHaiku(prompt: string, maxTokens = 1200): Promise<string> {
  const msg = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    messages:   [{ role: 'user', content: prompt }],
  })
  return msg.content[0].type === 'text' ? msg.content[0].text : '{}'
}

function parseJSON<T>(text: string, fallback: T): T {
  try {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const raw   = match ? match[1] : text
    const start = raw.indexOf('{')
    const end   = raw.lastIndexOf('}')
    if (start === -1 || end === -1) return fallback
    return JSON.parse(raw.slice(start, end + 1)) as T
  } catch {
    return fallback
  }
}

// ─── Agent 1: Role Analyzer ────────────────────────────────────────────────────

export async function analyzeRole(jd: string): Promise<RoleAnalysis> {
  const text = await callHaiku(`Analyze this job description. Return ONLY a raw JSON object with no markdown or explanation.

JD:
${jd.slice(0, 1200)}

Return exactly:
{
  "role_type": "engineering",
  "onet_code": "15-1252.00",
  "onet_name": "Software Developers",
  "seniority": "senior",
  "is_technical": true,
  "key_requirements": ["PyTorch", "distributed systems", "Kubernetes"],
  "confidence": 0.85
}

role_type must be one of: engineering, sales, design, marketing, ops, finance, other
seniority must be one of: junior, mid, senior, lead, executive
Return ONLY the JSON object, nothing else.`)

  return parseJSON<RoleAnalysis>(text, {
    role_type: 'engineering',
    onet_code: '15-1252.00',
    onet_name: 'Software Developers',
    seniority: 'senior',
    is_technical: true,
    key_requirements: [],
    confidence: 0.5,
  })
}

// ─── Agent 2: DAG + Weight Builder ────────────────────────────────────────────

export async function buildScoringConfig(role: RoleAnalysis, jd: string): Promise<ScoringConfig> {
  const text = await callHaiku(`You are building a causal scoring model for recruiting.

Role: ${role.onet_name} (${role.onet_code})
Type: ${role.role_type} | Technical: ${role.is_technical} | Seniority: ${role.seniority}
Key requirements: ${role.key_requirements.slice(0, 5).join(', ')}
JD excerpt: ${jd.slice(0, 400)}

Set signal weights based on O*NET importance scores for this occupation.
Rules:
- All weights must sum to exactly 1.0 (check this carefully)
- If not technical (is_technical=false): github_velocity <= 0.05
- For sales/marketing: in_market_signal should be 0.15–0.25
- stage_suppresses_github = true only for technical roles
- GitHub factors correct for company stage (enterprise keeps code private, multiply commits up)

Return ONLY raw JSON, no markdown:
{
  "weights": {
    "github_velocity": 0.28,
    "experience_depth": 0.24,
    "stage_fit": 0.22,
    "skill_evidence": 0.14,
    "tenure_stability": 0.07,
    "in_market_signal": 0.05
  },
  "causal_edges": {
    "stage_suppresses_github": true,
    "stage_github_factors": {
      "enterprise": 1.40, "pre_ipo": 1.20, "series_c": 1.10,
      "series_b": 1.00, "series_a": 1.00, "seed": 0.95
    },
    "stage_tenure_factors": {
      "enterprise": 0.75, "pre_ipo": 0.88, "series_c": 0.94,
      "series_b": 1.00, "series_a": 1.00, "seed": 1.05
    },
    "reasoning": "Enterprise companies keep code in private repos, suppressing visible commits by 30–40%"
  },
  "target_stage": "series_b",
  "bls_median_tenure": 27,
  "onet_code": "${role.onet_code}",
  "onet_name": "${role.onet_name}",
  "weights_justification": {
    "github_velocity": "O*NET Programming importance 4.88/5 for this occupation",
    "experience_depth": "O*NET Systems Analysis importance 4.75/5",
    "stage_fit": "O*NET Complex Problem Solving importance 4.62/5",
    "skill_evidence": "O*NET Technology Design importance 4.38/5",
    "tenure_stability": "BLS risk signal",
    "in_market_signal": "Active learning proxy"
  }
}`)

  const raw = parseJSON<Partial<ScoringConfig>>(text, {})

  // Validate + normalize weights to ensure they sum to 1.0
  const weights = raw.weights ?? DEFAULT_SCORING_CONFIG.weights
  const sum = Object.values(weights).reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 1.0) > 0.02) {
    const factor = 1.0 / sum
    ;(Object.keys(weights) as (keyof typeof weights)[]).forEach(k => {
      weights[k] = Math.round(weights[k] * factor * 1000) / 1000
    })
  }

  return {
    weights,
    causal_edges:         raw.causal_edges         ?? DEFAULT_SCORING_CONFIG.causal_edges,
    target_stage:         raw.target_stage         ?? 'series_b',
    bls_median_tenure:    raw.bls_median_tenure    ?? 27,
    onet_code:            role.onet_code,
    onet_name:            role.onet_name,
    weights_justification: raw.weights_justification ?? DEFAULT_SCORING_CONFIG.weights_justification,
  }
}

// ─── Agent 3: Clay Prompt Builder ─────────────────────────────────────────────

export async function buildClaySetup(role: RoleAnalysis, jd: string): Promise<ClaySetup> {
  const text = await callHaiku(`Generate Clay AI column prompts for recruiting candidates.

Role: ${role.onet_name} | Type: ${role.role_type} | Technical: ${role.is_technical}
Key requirements: ${role.key_requirements.slice(0, 5).join(', ')}
JD excerpt: ${jd.slice(0, 500)}

Write specific, actionable prompts that a Clay AI column will run on each candidate row.
Replace [role-specific] with actual terms from the role.

Return ONLY raw JSON, no markdown:
{
  "search_filters": {
    "titles": ["Senior Software Engineer", "ML Engineer", "Staff Engineer"],
    "keywords": ["PyTorch", "distributed systems", "model serving"],
    "seniority_levels": ["Senior", "Staff", "Lead", "Principal"],
    "company_size_hint": "50–5000 employees (Series A to Pre-IPO preferred)"
  },
  "clay_prompts": {
    "github_commits_6m": "Search GitHub for this person by name and current company. Count their total public commits in the last 6 months across all repos. Return only a number (0 if not found or profile is private).",
    "yrs_experience": "Based on their LinkedIn work history, how many total years of professional engineering experience do they have? Return only a number.",
    "company_stage": "What is the current funding stage of their current employer? Return exactly one of: seed, series_a, series_b, series_c, pre_ipo, enterprise. Use enterprise for public companies or 1000+ employees.",
    "avg_tenure_months": "Looking at their last 3 positions in their LinkedIn work history, what is the average duration in months? Return only a number.",
    "post_topics_match": "Look at their last 10 LinkedIn posts. Count how many mention these topics: machine learning, AI, distributed systems, infrastructure, model serving, MLOps. Return a number from 0 to 10.",
    "skills_verified": "Count skills they have DEMONSTRATED through shipped projects, open source contributions, technical blog posts, or measurable work outcomes — not just listed on their profile. Focus on: PyTorch, Kubernetes, distributed training, model optimization, GPU, LLM. Return only a number."
  }
}`)

  return parseJSON<ClaySetup>(text, {
    search_filters: {
      titles:          [`${role.seniority} ${role.role_type} engineer`],
      keywords:        role.key_requirements.slice(0, 5),
      seniority_levels: ['Senior', 'Lead', 'Staff', 'Principal'],
      company_size_hint: '50–5000 employees',
    },
    clay_prompts: {
      github_commits_6m: 'Count total public GitHub commits in the last 6 months. Return only a number (0 if not found).',
      yrs_experience:    'Years of professional experience in this field from LinkedIn. Return only a number.',
      company_stage:     'Current employer funding stage. Return one of: seed, series_a, series_b, series_c, pre_ipo, enterprise.',
      avg_tenure_months: 'Average job duration across last 3 positions in months. Return only a number.',
      post_topics_match: 'Count of last 10 LinkedIn posts matching role topics (0–10). Return only a number.',
      skills_verified:   'Count of demonstrated skills with evidence (not just listed). Return only a number.',
    },
  })
}

// ─── Agent 4: Top-10 Selector ─────────────────────────────────────────────────

export async function selectTopCandidates(
  scored: Array<{
    name: string; score: number; confidence: number
    is_hidden_gem: boolean; company_stage: string; yrs_experience: number
  }>,
  jd: string,
  role: RoleAnalysis
): Promise<{ top10: string[]; reasoning: string; red_flags: { name: string; flag: string }[] }> {
  const summary = scored.slice(0, Math.min(scored.length, 15)).map((c, i) =>
    `#${i + 1} ${c.name}: score=${c.score}, confidence=${Math.round(c.confidence * 100)}%, stage=${c.company_stage}, yrs=${c.yrs_experience}${c.is_hidden_gem ? ', HIDDEN_GEM' : ''}`
  ).join('\n')

  const n = Math.min(scored.length, 10)

  const text = await callHaiku(`You are a senior recruiter reviewing algorithmically scored candidates.

Role: ${role.onet_name} (${role.seniority} level)
JD: ${jd.slice(0, 300)}

Scored candidates:
${summary}

Select the best ${n} candidates. Consider score + confidence together.
Hidden gems (strong signals, thin data) deserve serious consideration.
Flag any concerns.

Return ONLY raw JSON, no markdown:
{
  "top10": ["Name1", "Name2", "Name3"],
  "reasoning": "I selected these candidates because... [2-3 sentences, specific and causal]",
  "red_flags": [
    { "name": "Candidate Name", "flag": "Low confidence — missing key data signals" }
  ]
}

top10 must contain exactly ${n} names from the list above.`)

  const result = parseJSON<{
    top10: string[]
    reasoning: string
    red_flags: { name: string; flag: string }[]
  }>(text, {
    top10:     scored.slice(0, n).map(c => c.name),
    reasoning: `Selected top ${n} candidates by combined score and data confidence.`,
    red_flags: [],
  })

  // Ensure all returned names exist in the pool
  const validNames = new Set(scored.map(c => c.name))
  result.top10 = result.top10.filter(name => validNames.has(name)).slice(0, n)
  if (result.top10.length < n) {
    const extra = scored.map(c => c.name).filter(name => !result.top10.includes(name))
    result.top10 = [...result.top10, ...extra].slice(0, n)
  }

  return result
}
