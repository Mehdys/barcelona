'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const EXAMPLE_JD = `We're hiring a Senior Software Engineer — ML Infrastructure to build the systems that power our AI products. You'll own distributed training pipelines, model serving infrastructure, and the tooling that lets our ML team move fast.

Requirements:
- 4+ years engineering experience, ideally in ML systems or backend infrastructure
- Hands-on experience with PyTorch, distributed training, or model serving (vLLM, Triton, TensorRT)
- Strong systems thinking — you've designed and owned production systems at scale
- Startup or scale-up background preferred (we move fast, no enterprise overhead)
- Public engineering contributions a plus (open source, technical writing, conference talks)`

const STEPS = [
  { label: 'Analyzing role & O*NET match' },
  { label: 'Building causal DAG + weights' },
  { label: 'Generating Clay column prompts' },
]

export default function HomePage() {
  const router = useRouter()
  const [mode,        setMode]        = useState<'text' | 'url'>('url')
  const [jd,          setJd]          = useState('')
  const [url,         setUrl]         = useState('')
  const [fetching,    setFetching]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [stepIdx,     setStepIdx]     = useState(-1)
  const [error,       setError]       = useState('')

  async function handleFetchUrl() {
    if (!url.trim()) return setError('Paste a job posting URL first.')
    setFetching(true)
    setError('')
    try {
      const res  = await fetch('/api/fetch-jd', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json() as { jd?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to fetch')
      setJd(data.jd ?? '')
      setMode('text')  // show the extracted text so user can review
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch URL')
    } finally {
      setFetching(false)
    }
  }

  async function handleAnalyze() {
    if (!jd.trim()) return setError('Paste a job description first.')
    setError('')
    setLoading(true)
    setStepIdx(0)

    try {
      const res = await fetch('/api/setup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ jdSummary: jd }),
      })

      setStepIdx(1)
      if (!res.ok) throw new Error('Setup failed')
      const data = await res.json()
      setStepIdx(2)

      sessionStorage.setItem('barcelona_setup', JSON.stringify(data))
      sessionStorage.setItem('barcelona_jd',    jd)

      router.push('/setup')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
      setStepIdx(-1)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold text-white">Analyze a job description</h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          The agent reads your JD, matches it to O*NET, builds a causal scoring model,
          and generates the exact Clay column prompts you need.
        </p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setMode('url')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            mode === 'url' ? 'bg-white text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Paste URL
        </button>
        <button
          onClick={() => setMode('text')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            mode === 'text' ? 'bg-white text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Paste text
        </button>
      </div>

      {mode === 'url' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-300">Job posting URL</label>
            <span className="text-xs text-zinc-600">Ashby, Greenhouse, Lever — or any public page (not LinkedIn)</span>
          </div>
          <div className="flex gap-2">
            <input
              value={url}
              onChange={e => { setUrl(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleFetchUrl()}
              placeholder="https://www.clay.com/jobs?ashby_jid=… or jobs.lever.co/… or greenhouse.io/…"
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
            />
            <button
              onClick={handleFetchUrl}
              disabled={fetching || !url.trim()}
              className="px-5 py-3 bg-zinc-800 text-zinc-300 text-sm font-medium rounded-xl hover:bg-zinc-700 transition-colors disabled:opacity-40 shrink-0"
            >
              {fetching ? 'Fetching…' : 'Import'}
            </button>
          </div>
          {fetching && (
            <div className="text-xs text-zinc-500 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
              Fetching page and extracting job description…
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-300">Job description</label>
            <button
              onClick={() => setJd(EXAMPLE_JD)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Use example
            </button>
          </div>
          <textarea
            value={jd}
            onChange={e => { setJd(e.target.value); setError('') }}
            placeholder="Paste the full job description here..."
            rows={10}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 resize-none"
          />
        </div>
      )}

      {/* Agent steps preview */}
      <div className="space-y-2">
        {STEPS.map((step, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
              stepIdx > i   ? 'bg-emerald-500 border-emerald-500 text-white' :
              stepIdx === i ? 'border-indigo-500 text-indigo-400 animate-pulse' :
              'border-zinc-700 text-zinc-600'
            }`}>
              {stepIdx > i ? '✓' : i + 1}
            </div>
            <span className={`text-sm transition-colors ${
              stepIdx === i ? 'text-white' : stepIdx > i ? 'text-zinc-400' : 'text-zinc-600'
            }`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <button
        onClick={mode === 'url' && !jd ? handleFetchUrl : handleAnalyze}
        disabled={loading || fetching || (mode === 'url' ? !url.trim() : !jd.trim())}
        className="w-full bg-white text-zinc-950 font-semibold py-3 rounded-xl hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading   ? 'Analyzing...' :
         fetching  ? 'Importing…'  :
         mode === 'url' && !jd ? 'Import & analyze →' :
         'Analyze JD →'}
      </button>
    </div>
  )
}
