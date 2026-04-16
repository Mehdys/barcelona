// Digital exhaust enrichment layer
// Fetches public GitHub + HackerNews data and computes semantic fit against JD
// Uses Transformers.js (all-MiniLM-L6-v2) for local embeddings — zero API key, zero cost

export interface GitHubProfile {
  bio:          string
  top_repos:    { name: string; description: string; topics: string[]; stars: number }[]
  top_languages: string[]
  recent_topics: string[]
}

export interface HNProfile {
  recent_comments: string[]   // up to 5 most recent
  top_themes:      string[]   // extracted themes
}

export interface EnrichmentResult {
  github_username:     string
  github_profile:      GitHubProfile | null
  hn_profile:          HNProfile | null
  semantic_fit_score:  number        // 0–10, cosine similarity scaled
  semantic_fit_topics: string[]      // overlapping themes found
  enrichment_error:    string | null
}

// ─── GitHub ───────────────────────────────────────────────────────────────────

async function fetchGitHubProfile(username: string): Promise<GitHubProfile | null> {
  try {
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Barcelona-Recruiting-App',
    }
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`
    }

    // Fetch user bio
    const userRes = await fetch(`https://api.github.com/users/${username}`, { headers })
    if (!userRes.ok) return null
    const user = await userRes.json() as { bio?: string }

    // Fetch top repos (sorted by stars, up to 10)
    const reposRes = await fetch(
      `https://api.github.com/users/${username}/repos?sort=stars&per_page=10&type=owner`,
      { headers }
    )
    if (!reposRes.ok) return null
    const repos = await reposRes.json() as Array<{
      name: string
      description: string | null
      topics?: string[]
      stargazers_count: number
      language: string | null
    }>

    const top_repos = repos
      .filter(r => !r.name.includes(username))  // skip profile repos
      .slice(0, 6)
      .map(r => ({
        name:        r.name,
        description: r.description ?? '',
        topics:      r.topics ?? [],
        stars:       r.stargazers_count,
      }))

    const langSet = new Set<string>()
    repos.forEach(r => { if (r.language) langSet.add(r.language) })

    const topicSet = new Set<string>()
    top_repos.forEach(r => r.topics.forEach(t => topicSet.add(t)))

    return {
      bio:           user.bio ?? '',
      top_repos,
      top_languages: [...langSet].slice(0, 8),
      recent_topics: [...topicSet].slice(0, 15),
    }
  } catch {
    return null
  }
}

// ─── HackerNews ───────────────────────────────────────────────────────────────

async function fetchHNProfile(username: string): Promise<HNProfile | null> {
  try {
    // Algolia HN Search API — free, no auth
    const res = await fetch(
      `https://hn.algolia.com/api/v1/search?tags=comment,author_${username}&hitsPerPage=10`,
      { headers: { 'User-Agent': 'Barcelona-Recruiting-App' } }
    )
    if (!res.ok) return null
    const data = await res.json() as { hits?: Array<{ comment_text?: string }> }
    const hits = data.hits ?? []

    const recent_comments = hits
      .slice(0, 5)
      .map(h => (h.comment_text ?? '').replace(/<[^>]+>/g, '').slice(0, 200))
      .filter(c => c.length > 20)

    // Extract rough themes from comment text
    const allText = recent_comments.join(' ').toLowerCase()
    const TECH_TERMS = [
      'llm', 'ml', 'distributed', 'kubernetes', 'rust', 'go', 'typescript', 'python',
      'database', 'infrastructure', 'performance', 'scaling', 'startup', 'open source',
      'compiler', 'networking', 'security', 'ai', 'data', 'backend', 'frontend', 'systems',
    ]
    const top_themes = TECH_TERMS.filter(t => allText.includes(t)).slice(0, 8)

    return { recent_comments, top_themes }
  } catch {
    return null
  }
}

// ─── Transformers.js Embeddings — local, free, no API key ─────────────────────
// Uses all-MiniLM-L6-v2 (384-dim, ~25MB) via @xenova/transformers
// Model is downloaded once on first call and cached in node_modules/.cache

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pipe: any = null

async function getEmbedder() {
  if (!_pipe) {
    // Dynamic import to avoid breaking SSR/build if package missing
    const { pipeline } = await import('@xenova/transformers')
    _pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,  // use 8-bit quantized model — faster, smaller
    })
  }
  return _pipe
}

async function embed(text: string): Promise<number[]> {
  const extractor = await getEmbedder()
  // all-MiniLM-L6-v2 has a 512 token limit (~2000 chars); slice chars not tokens
  const output = await extractor(text.slice(0, 2000), { pooling: 'mean', normalize: true })
  return Array.from(output.data)
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ─── Main enrichment function ─────────────────────────────────────────────────

export async function enrichCandidate(
  github_username: string,
  hn_username: string | undefined,
  jdSummary: string
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    github_username,
    github_profile:      null,
    hn_profile:          null,
    semantic_fit_score:  0,
    semantic_fit_topics: [],
    enrichment_error:    null,
  }

  try {
    const [github, hn] = await Promise.all([
      fetchGitHubProfile(github_username),
      hn_username ? fetchHNProfile(hn_username) : Promise.resolve(null),
    ])

    result.github_profile = github
    result.hn_profile = hn

    // Build candidate digital footprint text for embedding
    const footprintParts: string[] = []

    if (github) {
      if (github.bio)             footprintParts.push(`Bio: ${github.bio}`)
      if (github.top_languages.length) footprintParts.push(`Languages: ${github.top_languages.join(', ')}`)
      if (github.recent_topics.length) footprintParts.push(`GitHub topics: ${github.recent_topics.join(', ')}`)
      github.top_repos.slice(0, 3).forEach(r => {
        const desc = [r.name, r.description, r.topics.join(' ')].filter(Boolean).join(' — ')
        footprintParts.push(`Repo: ${desc}`)
      })
    }

    if (hn) {
      if (hn.top_themes.length) footprintParts.push(`HN interests: ${hn.top_themes.join(', ')}`)
    }

    if (footprintParts.length === 0) {
      result.enrichment_error = 'No public digital footprint found'
      return result
    }

    const footprint = footprintParts.join('\n')

    // Compute semantic similarity (try Anthropic embeddings, fall back to keyword overlap)
    try {
      const [jdVec, candidateVec] = await Promise.all([
        embed(jdSummary.slice(0, 1000)),
        embed(footprint),
      ])
      const similarity = cosine(jdVec, candidateVec)
      result.semantic_fit_score = Math.round(similarity * 10 * 10) / 10  // scale to 0–10
    } catch {
      // Fallback: keyword overlap scoring (no API call needed)
      result.semantic_fit_score = keywordOverlapScore(footprint, jdSummary)
    }

    // Extract overlapping topics for the narration
    result.semantic_fit_topics = extractOverlapTopics(footprint, jdSummary)

  } catch (err) {
    result.enrichment_error = err instanceof Error ? err.message : 'Enrichment failed'
  }

  return result
}

// ─── Keyword overlap fallback ──────────────────────────────────────────────────

function keywordOverlapScore(footprint: string, jd: string): number {
  const tokenize = (text: string) =>
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)

  const jdTokens  = new Set(tokenize(jd))
  const fpTokens  = tokenize(footprint)
  const matches   = fpTokens.filter(t => jdTokens.has(t))
  const uniqueMatches = new Set(matches).size
  // Score: unique matching tokens / sqrt(jd vocab size), capped at 10
  return Math.min(10, Math.round((uniqueMatches / Math.sqrt(jdTokens.size)) * 20) / 2)
}

function extractOverlapTopics(footprint: string, jd: string): string[] {
  const TECH_KEYWORDS = [
    // Languages & runtimes
    'python', 'typescript', 'javascript', 'rust', 'go', 'java', 'c\\+\\+', 'ruby', 'swift', 'kotlin',
    // Infrastructure
    'kubernetes', 'docker', 'aws', 'gcp', 'azure', 'terraform', 'ci/cd', 'devops',
    // AI/ML
    'machine learning', 'deep learning', 'llm', 'transformer', 'pytorch', 'tensorflow', 'rag', 'embedding',
    // Systems
    'distributed', 'microservices', 'kafka', 'redis', 'postgres', 'graphql', 'grpc', 'websocket',
    // Domains
    'fintech', 'health', 'saas', 'b2b', 'enterprise', 'startup', 'open source',
  ]

  const fpLower = footprint.toLowerCase()
  const jdLower = jd.toLowerCase()

  return TECH_KEYWORDS
    .filter(kw => new RegExp(kw).test(fpLower) && new RegExp(kw).test(jdLower))
    .map(kw => kw.replace(/\\/g, ''))
    .slice(0, 6)
}

// ─── Batch enrichment ──────────────────────────────────────────────────────────

export interface CandidateEnrichmentInput {
  name:            string
  github_username?: string
  hn_username?:    string
}

export async function enrichBatch(
  candidates: CandidateEnrichmentInput[],
  jdSummary: string,
  onProgress?: (name: string, result: EnrichmentResult) => void
): Promise<Map<string, EnrichmentResult>> {
  const results = new Map<string, EnrichmentResult>()

  await Promise.all(
    candidates
      .filter(c => c.github_username)
      .map(async c => {
        const result = await enrichCandidate(c.github_username!, c.hn_username, jdSummary)
        results.set(c.name, result)
        onProgress?.(c.name, result)
      })
  )

  return results
}
