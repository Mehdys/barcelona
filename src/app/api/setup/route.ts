import { NextRequest, NextResponse } from 'next/server'
import { analyzeRole, buildScoringConfig, buildClaySetup } from '@/lib/dag-agent'
import { AuditLogger } from '@/lib/audit-logger'

export async function POST(req: NextRequest) {
  try {
    const { jdSummary } = await req.json() as { jdSummary: string }

    if (!jdSummary?.trim()) {
      return NextResponse.json({ error: 'JD is required' }, { status: 400 })
    }

    const audit = new AuditLogger(jdSummary)

    // Agent 1: Role analysis
    audit.step('agent1.start', { model: 'claude-haiku-4-5-20251001', task: 'role_analysis' })
    const roleAnalysis = await analyzeRole(jdSummary)
    audit.setPhase1('role_analysis', roleAnalysis)

    // Agent 2: DAG + weights
    audit.step('agent2.start', { task: 'build_scoring_config' })
    const scoringConfig = await buildScoringConfig(roleAnalysis, jdSummary)
    audit.setPhase1('scoring_config', scoringConfig)

    // Agent 3: Clay prompts
    audit.step('agent3.start', { task: 'build_clay_setup' })
    const claySetup = await buildClaySetup(roleAnalysis, jdSummary)
    audit.setPhase1('clay_setup', claySetup)

    const auditLog = audit.finalize()

    return NextResponse.json({
      roleAnalysis,
      scoringConfig,
      claySetup,
      audit: auditLog,
    })
  } catch (err) {
    console.error('[setup] error:', err)
    return NextResponse.json({ error: 'Setup failed' }, { status: 500 })
  }
}
