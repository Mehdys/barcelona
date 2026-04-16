'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface RunSummary {
  id:               string
  created_at:       string
  jd_preview:       string
  candidates_count: number
  top_score:        number
  hidden_gems:      number
}

export default function RunsPage() {
  const router = useRouter()
  const [runs,    setRuns]    = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    fetch('/api/runs')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setRuns(data)
        else setError('Could not load runs — is Supabase configured?')
      })
      .catch(() => setError('Could not connect to database'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Past runs</h1>
          <p className="text-zinc-500 text-sm mt-1">
            All scoring runs persisted to Supabase — shareable by URL
          </p>
        </div>
        <button
          onClick={() => router.push('/')}
          className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-100 transition-colors"
        >
          New run →
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">
          Loading…
        </div>
      )}

      {error && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-3">
          <div className="text-zinc-400 text-sm">{error}</div>
          <div className="text-zinc-600 text-xs max-w-sm mx-auto leading-relaxed">
            Set <span className="font-mono text-zinc-400">NEXT_PUBLIC_SUPABASE_URL</span> and{' '}
            <span className="font-mono text-zinc-400">SUPABASE_SERVICE_ROLE_KEY</span> in{' '}
            <span className="font-mono text-zinc-400">.env.local</span> to enable persistence.
          </div>
        </div>
      )}

      {!loading && !error && runs.length === 0 && (
        <div className="flex items-center justify-center h-48 text-zinc-600 text-sm border border-dashed border-zinc-800 rounded-xl">
          No runs yet — score some candidates to get started
        </div>
      )}

      {runs.length > 0 && (
        <div className="space-y-2">
          {runs.map(run => (
            <button
              key={run.id}
              onClick={() => router.push(`/results/${run.id}`)}
              className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-4 flex items-center gap-5 text-left transition-colors group"
            >
              {/* Score pill */}
              <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex flex-col items-center justify-center shrink-0">
                <div className={`text-lg font-black tabular-nums leading-none ${
                  run.top_score >= 70 ? 'text-emerald-400' : run.top_score >= 50 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {run.top_score}
                </div>
                <div className="text-xs text-zinc-600 leading-none">top</div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors truncate">
                    {run.jd_preview || 'Untitled run'}
                  </span>
                  {run.hidden_gems > 0 && (
                    <span className="text-xs bg-purple-950 text-purple-400 border border-purple-800/60 rounded-full px-2 py-0.5 shrink-0">
                      {run.hidden_gems} gem{run.hidden_gems > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-600 font-mono">
                  {run.id} · {run.candidates_count} candidates · {new Date(run.created_at).toLocaleDateString()}
                </div>
              </div>

              <div className="text-zinc-700 group-hover:text-zinc-400 transition-colors text-sm shrink-0">
                →
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Supabase setup instructions (shown when no runs) */}
      {!loading && !error && runs.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Supabase setup</div>
          <div className="space-y-2 text-xs text-zinc-400 font-mono">
            <div className="bg-zinc-800 rounded-lg p-3 space-y-1">
              <div className="text-zinc-300">-- Run this SQL in Supabase → SQL Editor</div>
              <div className="text-zinc-500 whitespace-pre">{SQL_SCHEMA}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const SQL_SCHEMA = `create table runs (
  id               text primary key,
  created_at       timestamptz default now(),
  jd_preview       text,
  candidates_count int,
  top_score        int,
  hidden_gems      int,
  results          jsonb,
  audit            jsonb
);

create table webhook_candidates (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  webhook_id  text not null,
  jd_ref      text,
  name        text,
  data        jsonb
);

-- Enable RLS (Row Level Security) if needed
alter table runs enable row level security;
alter table webhook_candidates enable row level security;

-- Allow service role full access (server-side only)
create policy "service role access" on runs
  using (true) with check (true);
create policy "service role access" on webhook_candidates
  using (true) with check (true);`
