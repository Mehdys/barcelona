# Barcelona — Explainable AI Layer for Clay

> Clay gives you 200 people. We tell you which 12 to call.

Barcelona is the explainability layer on top of Clay enrichment. It turns your enriched pipeline into a transparent, auditable ranking — every decision backed by a reason you can read, challenge, and defend. O\*NET-backed weights, causal bias corrections, and SHAP explainability per candidate.

---

## The Problem

Sorting by years of experience is keyword filtering dressed up as recruiting.

It buries the engineer with 300 GitHub commits and a shipped vLLM plugin. It surfaces the enterprise hire who'll struggle in a 12-person team. The signal is there — you just don't have a system to read it.

---

## How It Works

**Three steps. Under 5 minutes.**

1. **Paste a job description URL** — the system reads your role, matches it to O\*NET labor data, and derives scoring weights specific to that hire (not generic)
2. **Enrich in Clay** — one Sculptor prompt, one credit per candidate. Export the CSV
3. **Get a ranked shortlist** — every candidate scored, explained, and ready to reach out to

---

## The Algorithm

### Signals & Weights

Anchored to O\*NET DOL empirical research (occupation code 15-1252.00):

| Signal | Weight | Source column |
|--------|--------|---------------|
| GitHub commit velocity | 28% | `github_commits_6m` |
| Years of relevant experience | 24% | `yrs_ml_experience` |
| Company stage match | 22% | `company_stage` |
| Verified skills (demonstrated, not listed) | 14% | `skills_verified` |
| Average tenure stability | 7% | `avg_tenure_months` |
| In-market signal (recent posts) | 5% | `post_topics_match` |

Weights are **derived per job description** — a data science role produces different weights than a backend engineering role.

### Normalization

- `github`, `experience`, `skills` → min-max across the candidate pool (relative, not global benchmark)
- `company_stage` → structural distance on funding lifecycle (seed → series_a → series_b → series_c → pre_ipo → enterprise)
- `tenure` → Gaussian centered on BLS median (24 months) — penalty both too short and too long
- `post_topics` → count / 10

### SHAP Explainability

For this linear additive model, SHAP values are analytically exact (no approximation):

```
shap[signal] = normalized[signal] × weight × 100
```

Every score comes with a full breakdown showing exactly which signals drove it and by how much.

### Causal Bias Corrections

Applied before normalization, per candidate:

- **Google/FAANG engineers** with low public GitHub commits → adjusted upward (private repos)
- **Seed-stage tenure under 14 months** → not penalized (normal for early startups)
- More corrections applied based on company size and stage context

### Counterfactual

```
counterfactual(candidate, signal) = score with that signal set to 1.0
```

"If this candidate fixed their weakest signal, they'd jump from 61 → 79." Shows exactly what coaching or additional context would change.

---

## What You Get Per Candidate

| Output | Description |
|--------|-------------|
| **Score (0–100)** | Deterministic. Same input always gives the same output. |
| **SHAP breakdown** | Which signals drove the score, and by how much |
| **Hidden gem flag** | Strong signals, thin data — people keyword filtering buries every time |
| **Counterfactual** | What would change their ranking and by how much |
| **Agent reasoning** | Written memo reviewing the full pool for patterns and anomalies |
| **Personalized outreach** | Cold email written from their actual LinkedIn/GitHub background — not a template |

---

## Why Math, Not AI

AI models are powerful but unpredictable. Ask them to score a candidate twice — you might get different answers. Ask them why they scored someone lower — you'll get a plausible-sounding reason that may not be the real one. That's not acceptable in hiring.

Barcelona's scoring formula is deterministic: same input, same output, every time. Claude handles language — narration, outreach, reasoning. Never math.

---

## Stack

- **Next.js 15** — UI + API routes
- **TypeScript** — fully typed scorer, normalizer, SHAP engine
- **Claude Haiku** — narration only (math → English, never scores)
- **Clay** — candidate enrichment (Sculptor AI + formula columns)
- **Recharts** — SHAP bar charts
- **Tailwind CSS** — styling
- **Supabase** — run history + audit log

---

## Project Structure

```
src/
├── app/
│   ├── analyze/        # Step 1: JD input + role analysis
│   ├── setup/          # Step 2: Clay table setup + Sculptor prompt
│   ├── score/          # Step 3: CSV upload + scoring
│   ├── results/        # Ranked candidate cards with SHAP bars
│   ├── signals/        # Pool-level signal importance dashboard
│   ├── algorithm/      # How it works (public explainer)
│   └── api/            # API routes (score, narrate, fetch-jd, etc.)
├── lib/
│   ├── scorer.ts       # Core scoring engine (pure TS, no deps)
│   ├── narrate.ts      # Claude narration + outreach writing
│   └── dag-agent.ts    # Role analysis + Clay setup generation
```

---

## Running Locally

```bash
npm install
```

Create a `.env.local` file:

```
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SUPABASE_URL=...        # optional, for run history
NEXT_PUBLIC_SUPABASE_ANON_KEY=...   # optional
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Clay Integration

Barcelona generates a ready-to-paste **Sculptor AI prompt** after JD analysis. In Clay:

1. Add an AI column using Sculptor
2. Paste the generated prompt
3. Run enrichment — all 6 signals return as structured JSON in one credit
4. Add formula columns to extract each signal

---

## License

MIT
