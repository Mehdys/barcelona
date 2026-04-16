# Project Barcelona — Clay Hackathon

## What We're Building

A Clay-powered candidate scoring engine that surfaces non-obvious talent using a deterministic algorithm — not prompts.

**Two-stage flow:**
1. **Clay** — broad enrichment (finds everyone who could be relevant)
2. **Our algorithm** — ranks who is actually worth reaching out to + explains why

---

## The Core Insight

Clay scores leads with a single number. We decompose that score into causal signals so a recruiter knows exactly why someone ranked where they did — and what would change their ranking.

**Keyword matcher:** Marcus (9yr exp) → #1
**Our algorithm:** Marcus → #5 (enterprise background, wrong stage, no in-market signal)

---

## Algorithm

### Signals (from Clay CSV export)
- `github_commits_6m` — execution velocity proxy
- `yrs_ml_experience` — depth
- `company_stage` — environment fit
- `avg_tenure_months` — stability/risk
- `post_topics_match` — in-market signal (0-10 posts matching role topics)
- `skills_verified` — demonstrated evidence count (not keyword count)

### Normalization
- `github`, `experience`, `skills` → min-max across the candidate pool (relative scoring)
- `company_stage` → structural distance from target stage on funding lifecycle (not arbitrary)
- `tenure` → Gaussian curve centered on BLS median (24mo) — penalty for too short or too long
- `post_topics` → count / 10

### Weights (O*NET anchored — DOL empirical research, 15-1252.00)
```
github_velocity:    0.28  (Programming, importance 4.88/5)
experience_depth:   0.24  (Systems analysis, importance 4.75/5)
stage_fit:          0.22  (Complex problem solving, importance 4.62/5)
skill_evidence:     0.14  (Technology design, importance 4.38/5)
tenure_stability:   0.07  (Risk signal)
in_market_signal:   0.05  (Active learning proxy)
```

### SHAP
For linear additive models, SHAP is analytically exact:
`shap[signal] = normalized[signal] × weight × 100`

No library needed. No approximation. Each value = exact points contributed.

### Counterfactual
`counterfactual(candidate, signal) = score with that signal set to 1.0`

Find the biggest gap → compute new score → "If X improved, score goes 61 → 78"

### Narration
SHAP values (math) → Claude Haiku → English explanation per candidate:
- Why they ranked here (causal, not keyword)
- Hidden signal (what a keyword scanner misses)
- Gap + counterfactual
- Personalized outreach opening line

---

## Stack
- **Next.js** — UI + API routes
- **Claude Haiku** — narration layer (cheap, fast)
- **Clay CSV export** — data source
- **O*NET API** — weight justification
- **Recharts** — SHAP bar charts

---

## UI: 3 Screens

### / — Input
- Paste JD summary
- Upload Clay CSV export
- "Rank candidates" button

### /results — Ranked Cards
Each card shows:
- Score (0-100) + rank
- SHAP bar chart (which signals drove the score)
- Why they ranked here (3 bullets, causal)
- Hidden signal badge
- Gap + counterfactual
- Outreach hook (copy button)

### /signals — Signal Dashboard
- "You enriched 6 fields. These 3 drive 79% of the score."
- Signal importance chart across the whole pool
- Before/after: keyword ranking vs our ranking

---

## Clay Table Setup (parallel to UI build)
JD: Clay's own ML Infrastructure Lead

AI columns to add in Clay:
1. Skills with demonstrated evidence (not just listed) → count
2. Post topics matching role (count of last 10 posts)
3. Raw data export for our scorer

---

## What Differentiates This

1. **Weights are grounded** — O*NET DOL research, not opinions
2. **Normalization is relative** — scores mean something vs the actual pool
3. **Stage fit is structural** — distance function, not arbitrary assignment
4. **Tenure is calibrated** — BLS median, not "more = better"
5. **SHAP is exact** — linear model, analytically computed, not approximated
6. **Counterfactuals** — tells recruiter what to look for next, not just who to pick now
7. **Narration is math → English** — Claude explains the score, doesn't generate it

---

## The Pitch to Clay

> "Clay built the world's best GTM data layer. We built the missing piece — outcome intelligence that tells you which signals actually move the needle. Clay has no memory of what worked. We add that layer."

---

## 7-Hour Plan
```
Hour 1   Clay table setup — 6 enrichment columns, AI column prompts, run on 25 candidates
Hour 2   Next.js scaffold — routing, layout, CSV upload
Hour 3   Scoring engine — scorer.ts (deterministic math)
Hour 4   Candidate cards UI — score, SHAP bars, narration sections
Hour 5   Claude narration — API route, Haiku calls per candidate
Hour 6   Signal dashboard — pool-level importance chart
Hour 7   Demo prep — pick 3 killer finds, prepare contrast slide
```
