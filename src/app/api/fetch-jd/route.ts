import { NextRequest } from 'next/server'

// ─── ATS detectors ────────────────────────────────────────────────────────────
// Each returns { company, jobId } or null

function detectAshby(url: string): { jobId: string; company?: string } | null {
  // Embedded widget: https://company.com/jobs?ashby_jid=UUID
  const paramMatch = url.match(/ashby_jid=([a-f0-9-]{36})/i)
  if (paramMatch) return { jobId: paramMatch[1] }

  // Hosted: https://jobs.ashbyhq.com/company/UUID
  const hostedMatch = url.match(/jobs\.ashbyhq\.com\/([^/]+)\/([a-f0-9-]{36})/i)
  if (hostedMatch) return { company: hostedMatch[1], jobId: hostedMatch[2] }

  return null
}

function detectGreenhouse(url: string): { company: string; jobId: string } | null {
  // https://boards.greenhouse.io/company/jobs/123456
  const m = url.match(/greenhouse\.io\/([^/]+)\/jobs\/(\d+)/i)
  return m ? { company: m[1], jobId: m[2] } : null
}

function detectLever(url: string): { company: string; jobId: string } | null {
  // https://jobs.lever.co/company/UUID
  const m = url.match(/jobs\.lever\.co\/([^/]+)\/([a-f0-9-]{36})/i)
  return m ? { company: m[1], jobId: m[2] } : null
}

// ─── ATS fetchers ─────────────────────────────────────────────────────────────

async function fetchAshby(jobId: string): Promise<string> {
  const res = await fetch(
    `https://api.ashbyhq.com/posting-api/job-posting/${jobId}`,
    { signal: AbortSignal.timeout(10_000) }
  )
  if (res.status === 401 || res.status === 403) {
    throw new Error('This job posting is private or internal-only. Try opening the URL in your browser, copying the job description text, and using "Paste text" instead.')
  }
  if (!res.ok) throw new Error(`Ashby API ${res.status}`)
  const data = await res.json() as {
    title?: string
    descriptionHtml?: string
    descriptionPlain?: string
    teamName?: string
    locationName?: string
  }
  const body = data.descriptionPlain
    ?? stripHtml(data.descriptionHtml ?? '')
  return [
    data.title && `# ${data.title}`,
    data.teamName && `Team: ${data.teamName}`,
    data.locationName && `Location: ${data.locationName}`,
    '',
    body,
  ].filter(Boolean).join('\n')
}

async function fetchGreenhouse(company: string, jobId: string): Promise<string> {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${company}/jobs/${jobId}`,
    { signal: AbortSignal.timeout(10_000) }
  )
  if (!res.ok) throw new Error(`Greenhouse API ${res.status}`)
  const data = await res.json() as {
    title?: string
    content?: string
    location?: { name?: string }
  }
  return [
    data.title && `# ${data.title}`,
    data.location?.name && `Location: ${data.location.name}`,
    '',
    stripHtml(data.content ?? ''),
  ].filter(Boolean).join('\n')
}

async function fetchLever(company: string, jobId: string): Promise<string> {
  const res = await fetch(
    `https://api.lever.co/v0/postings/${company}/${jobId}`,
    { signal: AbortSignal.timeout(10_000) }
  )
  if (!res.ok) throw new Error(`Lever API ${res.status}`)
  const data = await res.json() as {
    text?: string
    descriptionPlain?: string
    description?: string
    lists?: { text: string; content: string }[]
    categories?: { location?: string; team?: string }
  }
  const sections = (data.lists ?? []).map(l => `${l.text}:\n${stripHtml(l.content)}`).join('\n\n')
  return [
    data.text && `# ${data.text}`,
    data.categories?.team && `Team: ${data.categories.team}`,
    data.categories?.location && `Location: ${data.categories.location}`,
    '',
    data.descriptionPlain ?? stripHtml(data.description ?? ''),
    sections,
  ].filter(Boolean).join('\n')
}

async function fetchJina(url: string): Promise<string> {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Jina ${res.status}`)
  return res.text()
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|li|h[1-6]|div)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { url } = await req.json() as { url: string }

  if (!url?.trim()) return Response.json({ error: 'URL is required' }, { status: 400 })

  if (url.includes('linkedin.com')) {
    return Response.json({
      error: 'LinkedIn requires login — copy the job text and use "Paste text" instead.',
    }, { status: 422 })
  }

  let jd: string
  let source: string

  try {
    const ashby = detectAshby(url)
    const greenhouse = detectGreenhouse(url)
    const lever = detectLever(url)

    if (ashby) {
      try {
        jd = await fetchAshby(ashby.jobId)
        source = 'Ashby'
      } catch {
        // Ashby API blocked (private/restricted) — fall back to scraping the original page
        jd = await fetchJina(url.trim())
        source = 'web'
      }
    } else if (greenhouse) {
      jd = await fetchGreenhouse(greenhouse.company, greenhouse.jobId)
      source = 'Greenhouse'
    } else if (lever) {
      jd = await fetchLever(lever.company, lever.jobId)
      source = 'Lever'
    } else {
      jd = await fetchJina(url.trim())
      source = 'web'
    }
  } catch (err) {
    return Response.json(
      { error: `Could not fetch job: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 422 }
    )
  }

  if (!jd?.trim()) {
    return Response.json({ error: 'Page returned empty content — try pasting the text instead' }, { status: 422 })
  }

  return Response.json({ jd: jd.trim().slice(0, 8000), source })
}
