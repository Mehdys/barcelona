import Anthropic from '@anthropic-ai/sdk'
import type { ScoredCandidate, ShapValues } from './scorer'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SIGNAL_LABELS: Record<keyof ShapValues, string> = {
  github_velocity:   'GitHub commit velocity',
  experience_depth:  'Engineering experience depth',
  stage_fit:         'Company stage match',
  skill_evidence:    'Verified skill evidence',
  tenure_stability:  'Tenure stability',
  in_market_signal:  'In-market signal (recent posts)',
}

export interface Narration {
  why:      string   // 2–3 causal bullets
  hidden:   string   // non-obvious insight
  gap:      string   // biggest weakness
  counter:  string   // counterfactual
  outreach: string   // full personalized outbound email
}

interface CandidateWithMeta extends ScoredCandidate {
  rank: number
  counterfactual_score: number
  gap_signal: string
}

export async function narrateCandidate(
  candidate: CandidateWithMeta,
  jdSummary: string,
  rank: number,
  counterfactualScore: number,
  gapSignal: string
): Promise<Narration> {
  const shapEntries = Object.entries(candidate.shap) as [keyof ShapValues, number][]
  const sorted      = shapEntries.sort((a, b) => b[1] - a[1])
  const topDrivers  = sorted.slice(0, 3).map(([k, v]) => `${SIGNAL_LABELS[k]}: +${v}pts`)
  const mainDrag    = sorted.slice(-2).map(([k, v]) => `${SIGNAL_LABELS[k]}: ${v}pts`)

  const causalNote = candidate.causal_adjustments?.length
    ? `Causal adjustments: ${candidate.causal_adjustments.map(a => `${a.signal} ${a.raw}→${a.adjusted} (${a.reason.split(':')[0]})`).join('; ')}`
    : ''

  const semanticNote = candidate.semantic_fit_score != null
    ? `Semantic fit score: ${candidate.semantic_fit_score}/10 (GitHub repos + HN activity vs JD)${
        candidate.semantic_fit_topics?.length ? ` — overlapping topics: ${candidate.semantic_fit_topics.join(', ')}` : ''
      }`
    : ''

  const firstName = candidate.name.split(' ')[0]

  const stageLabel: Record<string, string> = {
    seed: 'early-stage startup', series_a: 'Series A', series_b: 'Series B',
    series_c: 'Series C', pre_ipo: 'pre-IPO company', enterprise: 'large enterprise',
  }
  const stageCtx = stageLabel[candidate.company_stage] ?? 'tech company'

  // Build qualitative profile — this is the foundation for personalization
  const profileLines: string[] = []
  if (candidate.job_title || candidate.company_name) {
    profileLines.push(`Current role: ${[candidate.job_title, candidate.company_name].filter(Boolean).join(' at ')} (${stageCtx})`)
  }
  if (candidate.headline) profileLines.push(`LinkedIn headline: "${candidate.headline}"`)
  if (candidate.summary)  profileLines.push(`LinkedIn summary excerpt: "${candidate.summary.slice(0, 400)}"`)
  if (candidate.semantic_fit_topics?.length) {
    profileLines.push(`GitHub/HN technical interests: ${candidate.semantic_fit_topics.slice(0, 5).join(', ')}`)
  }

  // Qualitative signal translation — never send raw numbers to the outreach writer
  const trajectorySignal = candidate.yrs_experience >= 8
    ? 'Senior engineer with significant industry depth'
    : candidate.yrs_experience >= 4
    ? 'Mid-to-senior engineer, past the learning curve'
    : 'Early-career engineer with strong growth trajectory'

  const buildingSignal = candidate.github_commits_6m > 150
    ? 'Actively building in public — high recent output'
    : candidate.github_commits_6m > 0
    ? 'Some public work visible'
    : 'Works primarily in private repos'

  const prompt = `You are writing outreach for a recruiter hiring for this role:
${jdSummary.slice(0, 500)}

═══ CANDIDATE PROFILE (lead with this for personalization) ═══
Name: ${candidate.name} | First name: ${firstName}
${profileLines.length ? profileLines.join('\n') : `Background: ${trajectorySignal}, currently at a ${stageCtx}`}
${buildingSignal}
Experience level: ${trajectorySignal}

═══ SCORING CONTEXT (for why/hidden/gap — do NOT surface in outreach) ═══
Rank #${rank} | Score ${candidate.score}/100${candidate.is_hidden_gem ? ' — hidden gem flag' : ''}
Top signals: ${topDrivers.join(', ')}
Main drag: ${mainDrag.join(', ')}
Biggest gap: ${gapSignal.replace(/_/g, ' ')} | Could reach ${counterfactualScore} if fixed
${causalNote}
${semanticNote}

Write exactly 4 JSON fields:

1. "why": 2–3 bullet points (•) explaining WHY they rank #${rank}. Causal reasoning, not keyword matching. Reference their actual profile.

2. "hidden": One sentence — the non-obvious insight a keyword scanner would miss. Could be positive (underrated signal) or a risk.

3. "gap": One sentence — their single biggest weakness for this specific role.

4. "outreach": Cold email, 60–80 words MAX. Strict rules:
   - USE their actual headline, summary, or technical interests as the opening hook
   - If they have a LinkedIn summary or headline, reference something SPECIFIC from it — a project, a technology, a mission they mentioned
   - ONE sentence on why this role matches where they are right now
   - Clear ask: 15-minute call
   - No "hope this finds you well", no "excited to connect", no "I came across your profile"
   - Never quote numbers (commits, years, scores, tenure)
   - First-name only, casual but professional
   - Format: "Subject: ...\n\n[body]"

Return ONLY valid JSON: {"why":"...","hidden":"...","gap":"...","outreach":"..."}`

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages:   [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '{}'

  try {
    const start = text.indexOf('{')
    const end   = text.lastIndexOf('}')
    const parsed = JSON.parse(text.slice(start, end + 1))
    return {
      why:      parsed.why      ?? topDrivers.join('\n'),
      hidden:   parsed.hidden   ?? '',
      gap:      parsed.gap      ?? `Lowest signal: ${gapSignal.replace(/_/g, ' ')}`,
      counter:  `do(${gapSignal.replace(/_/g, ' ')}=max) → ${candidate.score} → ${counterfactualScore}`,
      outreach: parsed.outreach ?? `Hi ${candidate.name.split(' ')[0]},`,
    }
  } catch {
    return {
      why:      topDrivers.join('\n'),
      hidden:   candidate.is_hidden_gem ? 'Strong signals with thin data — worth investigating.' : '',
      gap:      `Lowest signal: ${gapSignal.replace(/_/g, ' ')}`,
      counter:  `Score could reach ${counterfactualScore} if ${gapSignal.replace(/_/g, ' ')} improves`,
      outreach: `Hi ${candidate.name.split(' ')[0]},`,
    }
  }
}
