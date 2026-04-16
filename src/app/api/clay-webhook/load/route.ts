import { NextRequest } from 'next/server'
import { getWebhookCandidates } from '@/lib/supabase'
import type { RawCandidate } from '@/lib/scorer'

// GET /api/clay-webhook/load?webhook_id=wh_xxx
// Returns the candidates stored for a given webhook_id
export async function GET(req: NextRequest) {
  const webhookId = req.nextUrl.searchParams.get('webhook_id')
  if (!webhookId) {
    return Response.json({ error: 'webhook_id is required' }, { status: 400 })
  }

  const rows = await getWebhookCandidates(webhookId)
  if (!rows.length) {
    return Response.json({ error: 'No candidates found for this webhook ID — is Supabase configured?' }, { status: 404 })
  }

  const candidates: RawCandidate[] = rows.map(r => r.data as RawCandidate)

  return Response.json({ candidates, count: candidates.length, webhook_id: webhookId })
}
