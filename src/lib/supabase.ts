// Supabase client — server-side only (API routes + server components)
// Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local

import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey  = process.env.SUPABASE_SERVICE_ROLE_KEY   // service role — server only

// Returns null if env vars not set (graceful degradation — app still works without Supabase)
export function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RunRow {
  id:               string       // bcn_{timestamp}
  created_at:       string
  jd_preview:       string
  candidates_count: number
  top_score:        number
  hidden_gems:      number
  results:          unknown      // full ResultsData JSON blob
  audit:            unknown      // AuditLog JSON blob
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function saveRun(run: Omit<RunRow, 'created_at'>): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false

  const { error } = await sb.from('runs').upsert({
    id:               run.id,
    jd_preview:       run.jd_preview,
    candidates_count: run.candidates_count,
    top_score:        run.top_score,
    hidden_gems:      run.hidden_gems,
    results:          run.results,
    audit:            run.audit,
  })

  if (error) console.error('[supabase] saveRun error:', error.message)
  return !error
}

export async function getRun(id: string): Promise<RunRow | null> {
  const sb = getSupabase()
  if (!sb) return null

  const { data, error } = await sb
    .from('runs')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data as RunRow
}

export async function listRuns(limit = 20): Promise<RunRow[]> {
  const sb = getSupabase()
  if (!sb) return []

  const { data, error } = await sb
    .from('runs')
    .select('id, created_at, jd_preview, candidates_count, top_score, hidden_gems')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return []
  return (data ?? []) as RunRow[]
}

// ─── Clay webhook candidates table ────────────────────────────────────────────

export interface WebhookCandidateRow {
  id:           string
  created_at:   string
  webhook_id:   string    // groups rows from the same Clay export
  jd_ref:       string    // which JD this was for (from webhook payload)
  name:         string
  data:         unknown   // raw RawCandidate fields as JSON
}

export async function saveWebhookCandidates(
  webhookId: string,
  jdRef: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  candidates: any[]
): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false

  const rows = candidates.map(c => ({
    webhook_id: webhookId,
    jd_ref:     jdRef,
    name:       c.name ?? 'Unknown',
    data:       c,
  }))

  const { error } = await sb.from('webhook_candidates').insert(rows)
  if (error) console.error('[supabase] saveWebhookCandidates error:', error.message)
  return !error
}

export async function getWebhookCandidates(webhookId: string) {
  const sb = getSupabase()
  if (!sb) return []

  const { data } = await sb
    .from('webhook_candidates')
    .select('*')
    .eq('webhook_id', webhookId)
    .order('created_at', { ascending: true })

  return (data ?? []) as WebhookCandidateRow[]
}
