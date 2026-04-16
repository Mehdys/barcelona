import { NextRequest } from 'next/server'
import {
  scoreCandidates, counterfactual, biggestGap,
  DEFAULT_SCORING_CONFIG,
  type RawCandidate, type ScoringConfig,
} from '@/lib/scorer'
import { narrateCandidate } from '@/lib/narrate'
import { selectTopCandidates, type RoleAnalysis } from '@/lib/dag-agent'
import { AuditLogger } from '@/lib/audit-logger'
import { enrichBatch } from '@/lib/enrich'
import { saveRun, getRun } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    candidates: RawCandidate[]
    jdSummary: string
    scoringConfig?: ScoringConfig
    roleAnalysis?: RoleAnalysis
  }

  const { candidates, jdSummary, scoringConfig, roleAnalysis } = body

  if (!candidates?.length) {
    return new Response(JSON.stringify({ error: 'No candidates provided' }), { status: 400 })
  }

  const encoder = new TextEncoder()

  // SSE helper
  function line(event: string, data: unknown): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify({ event, data })}\n\n`)
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(line(event, data))

      try {
        const config = scoringConfig ?? DEFAULT_SCORING_CONFIG
        const role: RoleAnalysis = roleAnalysis ?? {
          role_type: 'engineering',
          onet_code: config.onet_code ?? '15-1252.00',
          onet_name: config.onet_name ?? 'Software Developers',
          seniority: 'senior',
          is_technical: true,
          key_requirements: [],
          confidence: 0.5,
        }

        const audit = new AuditLogger(jdSummary)

        // Step 0: Digital exhaust enrichment (GitHub + HN semantic fit)
        const hasGitHubUsernames = candidates.some(c => c.github_username)
        if (hasGitHubUsernames) {
          send('step', { label: `Enriching digital footprint (GitHub + HackerNews)…`, index: 0 })
          const enrichmentMap = await enrichBatch(
            candidates.map(c => ({
              name:            c.name,
              github_username: c.github_username,
              hn_username:     c.hn_username,
            })),
            jdSummary,
            (name, result) => {
              send('enrich', {
                name,
                semantic_fit_score:  result.semantic_fit_score,
                semantic_fit_topics: result.semantic_fit_topics,
                error:               result.enrichment_error,
              })
            }
          )

          // Merge enrichment results back into candidates
          for (let i = 0; i < candidates.length; i++) {
            const enriched = enrichmentMap.get(candidates[i].name)
            if (enriched) {
              candidates[i] = {
                ...candidates[i],
                semantic_fit_score:  enriched.semantic_fit_score,
                semantic_fit_topics: enriched.semantic_fit_topics,
              }
            }
          }
          send('enriched', { count: enrichmentMap.size })
        }

        // Step 1: Deterministic scoring (instant)
        send('step', { label: 'Running causal scoring…', index: hasGitHubUsernames ? 1 : 0 })
        const scored = scoreCandidates(candidates, config)
        const withMeta = scored.map((c, i) => {
          const gap     = biggestGap(c)
          const cfScore = counterfactual(c, gap, config)
          return { ...c, rank: i + 1, gap_signal: gap, counterfactual_score: cfScore }
        })

        audit.setScoring({
          candidates_count: scored.length,
          config_used: { onet_code: config.onet_code, weights: config.weights, causal_reasoning: config.causal_edges.reasoning },
          per_candidate: withMeta.map(c => ({
            name: c.name, score: c.score, confidence: c.confidence,
            causal_adjustments: c.causal_adjustments,
            normalized: c.normalized, shap: c.shap,
          })),
        })

        send('scored', { count: withMeta.length })

        // Step 2: Agent selection
        const stepOffset = hasGitHubUsernames ? 1 : 0
        send('step', { label: 'Agent selecting top candidates…', index: 1 + stepOffset })
        const { top10, reasoning, red_flags } = await selectTopCandidates(withMeta, jdSummary, role)
        audit.setSelection({ top10, reasoning, red_flags })
        send('selection', { top10, reasoning, redFlags: red_flags })

        // Step 3: Narrate all candidates in parallel — stream each as it completes
        send('step', { label: `Generating personalized outreach (0/${withMeta.length})…`, index: 2 + stepOffset })

        const narratedAll: unknown[] = new Array(withMeta.length)
        let completed = 0

        await Promise.all(
          withMeta.map(async (c, i) => {
            const narration = await narrateCandidate(c, jdSummary, c.rank, c.counterfactual_score, c.gap_signal)
            const result = { ...c, narration }
            narratedAll[i] = result
            completed++
            send('candidate', result)
            send('progress', { completed, total: withMeta.length })
          })
        )

        const auditLog = audit.finalize()

        // Persist full results to Supabase (non-blocking — don't fail the stream)
        const allCandidatesForSave = narratedAll.filter(Boolean)
        const resultsPayload = {
          candidates:    allCandidatesForSave,
          top10,
          agentReasoning: reasoning,
          redFlags:       red_flags,
          scoringConfig:  config,
          roleAnalysis:   role,
        }
        const topScore    = Math.max(...withMeta.map(c => c.score), 0)
        const hiddenGems  = withMeta.filter(c => c.is_hidden_gem).length

        saveRun({
          id:               auditLog.run_id,
          jd_preview:       auditLog.jd_preview,
          candidates_count: withMeta.length,
          top_score:        topScore,
          hidden_gems:      hiddenGems,
          results:          resultsPayload,
          audit:            auditLog,
        }).catch(e => console.error('[score] saveRun failed:', e))

        send('done', {
          run_id:         auditLog.run_id,
          top10,
          agentReasoning: reasoning,
          redFlags:       red_flags,
          scoringConfig:  config,
          roleAnalysis:   role,
          audit:          auditLog,
        })
      } catch (err) {
        console.error('[score] stream error:', err)
        send('error', { message: err instanceof Error ? err.message : 'Scoring failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}

// GET /api/score?run_id=bcn_xxx — fetch a persisted run from Supabase
export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get('run_id')
  if (!runId) return Response.json({ error: 'run_id required' }, { status: 400 })

  const run = await getRun(runId)
  if (!run) return Response.json({ error: 'Run not found' }, { status: 404 })

  return Response.json(run.results)
}
