// Audit logger — every decision, calculation and agent output is captured
// Full run is serializable to JSON for 100% auditability

export interface AuditStep {
  timestamp: string
  step: string
  data: unknown
}

export interface AuditLog {
  run_id: string
  started_at: string
  completed_at?: string
  jd_preview: string
  phase1: {
    role_analysis?: unknown
    scoring_config?: unknown
    clay_setup?: unknown
  }
  scoring: {
    candidates_count: number
    config_used?: unknown
    per_candidate?: unknown[]
  }
  selection: {
    top10?: string[]
    reasoning?: string
    red_flags?: { name: string; flag: string }[]
  }
  steps: AuditStep[]
}

export class AuditLogger {
  private log: AuditLog

  constructor(jd: string) {
    this.log = {
      run_id:     `bcn_${Date.now()}`,
      started_at: new Date().toISOString(),
      jd_preview: jd.slice(0, 120).replace(/\n/g, ' '),
      phase1:  {},
      scoring: { candidates_count: 0 },
      selection: {},
      steps:   [],
    }
  }

  step(name: string, data: unknown) {
    this.log.steps.push({ timestamp: new Date().toISOString(), step: name, data })
    return this
  }

  setPhase1(key: keyof AuditLog['phase1'], data: unknown) {
    (this.log.phase1 as Record<string, unknown>)[key] = data
    return this.step(`phase1.${key}`, data)
  }

  setScoring(data: { candidates_count: number; config_used: unknown; per_candidate: unknown[] }) {
    this.log.scoring = data
    return this.step('scoring', { candidates_count: data.candidates_count })
  }

  setSelection(data: AuditLog['selection']) {
    this.log.selection = data
    return this.step('selection', data)
  }

  finalize(): AuditLog {
    this.log.completed_at = new Date().toISOString()
    return this.log
  }
}
