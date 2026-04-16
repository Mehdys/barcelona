# Project Barcelona — Claude Code Guide

## What This Is

A Clay-powered candidate scoring engine that surfaces non-obvious talent using a deterministic algorithm — not prompts.

**Two-stage flow:**
1. **Clay** — broad enrichment (finds everyone who could be relevant)
2. **Our algorithm** — ranks who is actually worth reaching out to + explains why

---

## Stack

- **Next.js 15** — UI + API routes
- **Claude Haiku** — narration only (math → English, never scores)
- **Recharts** — SHAP bar charts
- **Tailwind** — styling
- **TypeScript** — everything typed

---

## Key Files

- `src/` — all source code (scorer, API routes, components)
- `PLAN.md` — full algorithm spec, weights, normalization rules
- `package.json` — deps: `@anthropic-ai/sdk`, recharts, papaparse

---

## Algorithm

### Signals & Weights (O*NET DOL 15-1252.00)

```
github_velocity:    0.28  — github_commits_6m
experience_depth:   0.24  — yrs_ml_experience
stage_fit:          0.22  — company_stage (structural distance from target)
skill_evidence:     0.14  — skills_verified count (demonstrated, not listed)
tenure_stability:   0.07  — avg_tenure_months (Gaussian, BLS median 24mo)
in_market_signal:   0.05  — post_topics_match (count / 10)
```

### Normalization

- `github`, `experience`, `skills` → min-max across pool (relative)
- `company_stage` → structural distance on funding lifecycle
- `tenure` → Gaussian centered on 24mo (penalty both directions)
- `post_topics` → count / 10

### SHAP (exact — linear model, no approximation)

```
shap[signal] = normalized[signal] × weight × 100
```

### Counterfactual

```
counterfactual(candidate, signal) = score with that signal set to 1.0
```

---

## API Route

`POST /api/narrate` → sends SHAP values to Claude Haiku → returns English narrative per candidate.

**Never use Claude to generate scores.** The math is deterministic.

---

## UI Screens

| Route | What it does |
|-------|-------------|
| `/` | Upload Clay CSV + paste JD → trigger scoring |
| `/results` | Ranked candidate cards with SHAP bars + narration |
| `/signals` | Pool-level signal importance dashboard |

---

## Behavioral Rules

- Read files before editing them
- Never hardcode API keys — use `ANTHROPIC_API_KEY` from env
- Keep scorer logic pure TypeScript, no external deps
- Run `npm run lint` before committing
- All source code goes in `src/`, tests in `tests/`, docs in `docs/`
