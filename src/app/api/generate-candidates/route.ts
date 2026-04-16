import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { RoleAnalysis } from '@/lib/dag-agent'
import type { ScoringConfig } from '@/lib/scorer'

export async function POST(req: NextRequest) {
  const { jdSummary, roleAnalysis, scoringConfig } = await req.json() as {
    jdSummary:     string
    roleAnalysis:  RoleAnalysis
    scoringConfig: ScoringConfig
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  const client   = new Anthropic({ apiKey })
  const reqs     = roleAnalysis.key_requirements.slice(0, 5).join(', ') || 'software engineering'
  const stage    = scoringConfig.target_stage

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Generate 12 realistic fictional candidates for: ${roleAnalysis.onet_name} (${roleAnalysis.seniority}).
Key requirements: ${reqs}
Target company stage: ${stage}
JD context: ${jdSummary.slice(0, 400)}

Create a varied pool — 3 strong matches, 4 average, 3 hidden gems (high signals but sparse data = low confidence), 2 weak.
Vary company stages, commit counts, and tenure patterns realistically.

Return ONLY a raw JSON array, no markdown:
[{"name":"First Last","github_commits_6m":0-500,"yrs_experience":1-18,"company_stage":"seed|series_a|series_b|series_c|pre_ipo|enterprise","avg_tenure_months":8-60,"post_topics_match":0-10,"skills_verified":0-10,"github_username":"username_or_empty"}]`,
    }],
  })

  const text  = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]'
  const clean = text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim()

  let candidates
  try {
    candidates = JSON.parse(clean)
  } catch {
    return Response.json({ error: 'Failed to parse generated candidates', raw: clean }, { status: 500 })
  }

  return Response.json({ candidates, count: candidates.length })
}
