// Clay webhook receiver
// Clay fires this endpoint when an enrichment table is ready to export
//
// Setup in Clay: Table → Integrations → Webhook → POST https://your-domain/api/clay-webhook
// Optional: set CLAY_WEBHOOK_SECRET in .env.local for request validation
//
// Payload shape Clay sends (one of two formats):
//   Format A — single row: { "row": { ...fields } }
//   Format B — batch:      { "rows": [{ ...fields }, ...] }
//   We also support a direct array: [ { ...fields }, ... ]

import { NextRequest } from 'next/server'
import { saveWebhookCandidates } from '@/lib/supabase'
import type { RawCandidate } from '@/lib/scorer'

// Clay field name aliases — maps common Clay column names to our internal fields
const FIELD_MAP: Record<string, keyof RawCandidate> = {
  'github_commits_6m':      'github_commits_6m',
  'github commits 6m':      'github_commits_6m',
  'github_commits':         'github_commits_6m',
  'yrs_experience':         'yrs_experience',
  'years of experience':    'yrs_experience',
  'yrs_ml_experience':      'yrs_experience',
  'company_stage':          'company_stage',
  'funding stage':          'company_stage',
  'avg_tenure_months':      'avg_tenure_months',
  'average tenure months':  'avg_tenure_months',
  'post_topics_match':      'post_topics_match',
  'linkedin posts match':   'post_topics_match',
  'skills_verified':        'skills_verified',
  'verified skills':        'skills_verified',
  'github_username':        'github_username',
  'github username':        'github_username',
  'github':                 'github_username',
  'hn_username':            'hn_username',
  'hackernews username':    'hn_username',
}

function mapClayRow(row: Record<string, unknown>): RawCandidate {
  // Find name
  const name = String(
    row.name ?? row.Name ?? row.full_name ?? row['Full Name'] ?? row.person_name ?? 'Unknown'
  )

  // Map numeric fields
  function num(keys: string[]): number {
    for (const k of keys) {
      const v = row[k]
      if (v != null && v !== '') return Number(v) || 0
    }
    return 0
  }

  const github_commits_6m = num(['github_commits_6m', 'github_commits', 'githubCommits6m'])
  const yrs_experience    = num(['yrs_experience', 'yrs_ml_experience', 'yearsExperience', 'years_experience'])
  const avg_tenure_months = num(['avg_tenure_months', 'avgTenureMonths', 'tenure_months'])
  const post_topics_match = num(['post_topics_match', 'postTopicsMatch', 'linkedin_topics_match'])
  const skills_verified   = num(['skills_verified', 'skillsVerified', 'verified_skills'])

  const company_stage = String(
    row.company_stage ?? row.companyStage ?? row.funding_stage ?? row['Company Stage'] ?? 'series_b'
  ).toLowerCase().replace(/[\s-]/g, '_')

  const github_username = row.github_username
    ? String(row.github_username).trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '')
    : undefined

  const hn_username = row.hn_username ? String(row.hn_username).trim() : undefined

  return {
    name,
    github_commits_6m,
    yrs_experience,
    company_stage,
    avg_tenure_months,
    post_topics_match,
    skills_verified,
    ...(github_username ? { github_username } : {}),
    ...(hn_username     ? { hn_username }     : {}),
  }
}

function extractRows(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[]
  if (typeof body !== 'object' || body === null) return []
  const b = body as Record<string, unknown>
  if (Array.isArray(b.rows))  return b.rows  as Record<string, unknown>[]
  if (Array.isArray(b.data))  return b.data  as Record<string, unknown>[]
  if (b.row && typeof b.row === 'object') return [b.row as Record<string, unknown>]
  // Last resort: treat the whole body as a single row
  return [b]
}

export async function POST(req: NextRequest) {
  // Optional secret validation
  const secret = process.env.CLAY_WEBHOOK_SECRET
  if (secret) {
    const provided = req.headers.get('x-clay-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '')
    if (provided !== secret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawRows  = extractRows(body)
  if (!rawRows.length) {
    return Response.json({ error: 'No rows found in payload' }, { status: 400 })
  }

  const candidates: RawCandidate[] = rawRows.map(mapClayRow)

  // Extract metadata from payload if present
  const meta   = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {}
  const jdRef  = String(meta.jd_ref ?? meta.job_id ?? meta.jdRef ?? '')
  const webhookId = `wh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

  // Persist to Supabase (if configured) — non-blocking, don't fail on DB error
  await saveWebhookCandidates(webhookId, jdRef, candidates)

  return Response.json({
    ok:           true,
    webhook_id:   webhookId,
    received:     candidates.length,
    candidates_preview: candidates.slice(0, 3).map(c => ({ name: c.name, score_ready: false })),
    next_step:    `POST /api/score with { candidates, jdSummary } — or load webhook_id in the Score page`,
  })
}

// GET — test endpoint to verify the webhook URL is reachable
export async function GET() {
  return Response.json({
    status:      'ok',
    endpoint:    '/api/clay-webhook',
    description: 'Clay webhook receiver for Project Barcelona',
    setup:       'In Clay: Table → Integrations → Webhook → POST this URL',
    optional:    'Set CLAY_WEBHOOK_SECRET env var + x-clay-secret header for auth',
  })
}
