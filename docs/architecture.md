# Architecture Document

> Full system architecture for Friction — the solo founder's co-founder AI.

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Specification Layer](#2-specification-layer)
3. [Red-Team Layer](#3-red-team-layer)
4. [Decision Engine](#4-decision-engine)
5. [Decision Debt System](#5-decision-debt-system)
6. [Technical Architecture](#6-technical-architecture)
7. [LLM Orchestration](#7-llm-orchestration)
8. [State Management](#8-state-management)

---

## 1. System Architecture Overview

### High-Level Component Diagram

```
+---------------------------------------------------------------------+
|                        Friction                            |
|                                                                      |
|  +----------------------------+    +----------------------------+    |
|  |    SPECIFICATION LAYER     |    |      RED-TEAM LAYER        |    |
|  |                            |    |                            |    |
|  |  [Voice Input] [Text Input]|    |  [Devil's Advocate]        |    |
|  |         |          |       |    |  [Domain Expert]           |    |
|  |         v          v       |    |  [Customer Skeptic]        |    |
|  |  +-----------------------+ |    |  [Technical Debt Guardian] |    |
|  |  |  Structured Plan      | |    |  [Custom Personas...]      |    |
|  |  |  - Assumptions        |-|--->|                            |    |
|  |  |  - Goals              | |    |  Each persona produces:    |    |
|  |  |  - Constraints        | |    |  - Challenges              |    |
|  |  |  - Acceptance Criteria| |    |  - Counter-arguments       |    |
|  |  +-----------------------+ |    |  - Blindspot flags         |    |
|  +----------------------------+    +--------------|-------------+    |
|                                                  |                  |
|                                                  v                  |
|  +----------------------------------------------------------------+ |
|  |                     DECISION ENGINE                             | |
|  |                                                                 | |
|  |  Founder reviews each challenge:                                | |
|  |    [Approve]  → Challenge resolved, updates plan                | |
|  |    [Modify]   → Founder adjusts assumption, re-evaluates        | |
|  |    [Reject]   → Records rejection rationale, may accrue debt    | |
|  |    [Defer]    → Moves to Decision Debt tracker                  | |
|  |    [Skip]     → Informational only, no action                   | |
|  +------------------------------|----------------------------------+ |
|                                 |                                    |
|                                 v                                    |
|  +----------------------------------------------------------------+ |
|  |                   DECISION DEBT SYSTEM                          | |
|  |                                                                 | |
|  |  Tracks unresolved challenges over time:                        | |
|  |    - Debt ledger per project/session                            | |
|  |    - Aging rules and escalation                                 | |
|  |    - Periodic surfacing during new planning sessions            | |
|  |    - Correlation analysis across decisions                      | |
|  +----------------------------------------------------------------+ |
+---------------------------------------------------------------------+
         |                            |                    |
         v                            v                    v
+---------------+    +----------------------+    +-------------------+
| Execution     |    | Project Management   |    | Notification      |
| Agents        |    | Tools                |    | Layer             |
| (Claude Code, |    | (Linear, Notion,     |    | (Slack, Email,    |
|  Cursor, etc.)|    |  GitHub Issues)      |    |  CLI output)      |
+---------------+    +----------------------+    +-------------------+
```

### Data Flow Summary

1. **Founder provides raw input** — voice memo (transcribed via Whisper API) or written text
2. **Specification Layer** parses input into a **Structured Plan** containing title, context, explicitly/implicitly extracted assumptions, goals with priority, constraints, acceptance criteria, and founder confidence self-assessment
3. **Red-Team Layer** dispatches the structured plan in parallel to all active personas. Each receives the plan + persona system prompt + project history context + relevant past decisions
4. **Each persona** independently generates structured **Challenges** — objections keyed to specific assumptions or goals. The system deduplicates semantically similar challenges and groups them
5. **Decision Engine** presents challenges to the founder grouped by assumption, with persona attribution. Founder iterates with approve/modify/reject/defer/skip
6. **Deferred + certain rejected challenges** flow into the **Decision Debt Ledger**, which schedules review based on severity and staleness
7. **Final plan** (with all resolved decisions) is released to execution agents and/or project management tools

### Guiding Principles

- **Productive disagreement over speed** — the system deliberately slows the founder down at decision time to prevent faster failure
- **Local-first** — all data stays on the founder's machine by default
- **Pluggable execution** — Friction is a reasoning layer, not a replacement for coding agents
- **Extensible personas** — the four built-in personas are a starting point; founders can define their own

---

## 2. Specification Layer

### Purpose

Convert raw, unstructured founder input (voice or text) into a structured plan that can be systematically challenged. The layer makes implicit assumptions explicit — the gap between what the founder says and what they're actually betting on.

### Input Types

| Input Type | Processing Pipeline |
|---|---|
| **Voice Memo** | Whisper API (or local model) → transcription → filler word removal → sentence segmentation → structured extraction |
| **Written Brief** | Direct text → structured extraction |
| **Hybrid** | Voice transcribed + appended written notes → deduplication by semantic similarity |

### Extraction Strategy (Two-Pass)

**Pass 1 — Full Extraction**: Raw input → LLM with extraction prompt. Distinguishes between:
- **Explicit assumptions**: Founder stated them directly
- **Extracted assumptions**: Implied by the plan but never stated — these are the highest-value targets for the Red-Team

**Pass 2 — Verification**: Separate LLM call checks:
- No assumptions were fabricated
- All explicit assumptions were captured
- Confidence scores are reasonable

Disagreements between passes are flagged for founder review before the Red-Team runs.

### Structured Plan Output

```typescript
interface Plan {
  id: UUID;
  sessionId: UUID;
  title: string;
  rawInput: string;
  founderConfidence: Record<GoalId, 1..10>;  // self-assessed per goal
  
  assumptions: Assumption[];
  goals: Goal[];
  constraints: Constraint[];
  acceptanceCriteria: Criterion[];
  
  context: {
    projectPhase: "ideation" | "pre-launch" | "growth" | "scale";
    teamSize: number;
    runwayMonths: number | null;
    priorDecisions: DecisionReference[];
  };
}

interface Assumption {
  id: UUID;
  text: string;
  source: "explicit" | "extracted";
  sourceQuote: string | null;  // exact phrase from raw input
  category: "market" | "technical" | "user_behavior" | "financial" | "timeline";
  extractionConfidence: 1..10;
}

interface Goal {
  id: UUID;
  text: string;
  priority: "must_have" | "should_have" | "nice_to_have";
  successMetric: string | null;
  deadline: Date | null;
}

interface Constraint {
  id: UUID;
  text: string;
  type: "time" | "budget" | "technical" | "regulatory" | "resource" | "other";
  isHard: boolean;  // hard constraints cannot be violated
}

interface Criterion {
  id: UUID;
  text: string;
  measurable: boolean;
  measurementMethod: string | null;
}
```

### Edge Cases

| Scenario | Handling |
|---|---|
| **Very short input** ("I want to build a todo app") | System prompts clarifying questions before forming a plan — does not hallucinate assumptions |
| **Contradictory input** ("launch in 2 weeks" AND "build a full analytics suite") | Flagged as a built-in challenge before personas run |
| **Non-business input** (personal journaling) | Lightweight classifier detects domain; declines or routes to simpler mode |
| **Incomplete input** (mentions a goal but no constraints) | System prompts "Are there any constraints you're working under?" |

---

## 3. Red-Team Layer

### Purpose

Generate structured, adversarial critique of the founder's plan from multiple independent perspectives. Each persona is designed to catch a distinct category of blindspot.

### Persona Overview

| Persona | Core Mandate | Focus Area |
|---|---|---|
| **Devil's Advocate** | Assume the plan will fail. Find the most likely failure modes. | Assumption inversion, single points of failure, unstated preconditions |
| **Domain Expert** | Inject industry-specific knowledge the founder may lack. | Industry benchmarks, regulations, competitive dynamics, failure patterns |
| **Customer Skeptic** | Represent the least-enthusiastic, most-demanding customer. | Value proposition gaps, onboarding friction, switching costs |
| **Technical Debt Guardian** | Flag shortcuts that create compounding future costs. | Scalability ceilings, observability gaps, migration paths |

### Challenge Structure

```typescript
interface Challenge {
  id: UUID;
  persona: string;                        // persona identifier
  targets: UUID[];                        // targeted assumption/goal/constraint IDs
  severity: "blocker" | "major" | "minor" | "informational";
  category: 
    | "assumption_inversion" 
    | "gap_identified" 
    | "risk_flag" 
    | "alternative_approach";
  headline: string;                       // one-line summary
  body: string;                           // detailed argument (1-3 paragraphs)
  evidence: string | null;                // data point, citation, logical chain
  counterProposal: string | null;         // "Instead of X, consider Y"
  confidence: 1..10;                      // persona's confidence in this challenge
  relatedPastDecisions: UUID[];           // links to prior entries
  conflictWith: UUID[];                   // other challenges this contradicts
}
```

### Orchestration

By default, all personas run in **parallel** for minimum latency. An optional **waterfall mode** configures later personas to receive output from earlier ones (e.g., Domain Expert findings inform Technical Debt Guardian).

### Conflict & Deduplication

After all personas complete:

1. **Semantic deduplication**: A lightweight LLM call groups similar challenges across personas
2. **Conflict detection**: Direct contradictions between personas are tagged as `conflict_pair` and presented together to the founder with: "Persona A says X, but Persona B says Y. Resolve this tension."
3. **Debate mode (optional)**: Founder can trigger a structured back-and-forth (3 rounds max) between conflicting personas, producing a debate transcript

---

## 4. Decision Engine

### Interaction Model

Each challenge is presented to the founder one at a time. The founder has 5 actions:

| Action | Behavior | Effect on Plan | Debt Implications |
|---|---|---|---|
| **Approve** | Challenge accepted as valid | Assumption marked "challenged_and_updated"; counter-proposal optionally adopted | None |
| **Modify** | Spirit accepted but conclusion adjusted | Original assumption + modification recorded; affected personas may re-evaluate | None |
| **Reject** | Founder disagrees; rationale required (1-2 sentences minimum) | Rejection recorded | May accrue if severity is blocker/major and rationale is weak |
| **Defer** | Acknowledged but needs more info | Challenge moved to debt ledger with scheduled review | Entry created (7d for major, 14d for minor) |
| **Skip** | Informational; acknowledged without action | Recorded but no follow-up | None |

### Decision Recording

All interactions are written to an append-only decision log:

```typescript
interface Decision {
  id: UUID;
  challengeId: UUID;
  sessionId: UUID;
  timestamp: DateTime;
  action: "approved" | "modified" | "rejected" | "deferred" | "skipped";
  rationale: string;
  modifiedAssumption: Assumption | null;  // if action was "modified"
  debtAccrued: boolean;
  debtId: UUID | null;
}
```

---

## 5. Decision Debt System

### What Constitutes Decision Debt

Debt accrues through three pathways:

1. **Deferred challenges** — automatically creates a debt entry with a scheduled review date
2. **Rejected high-severity challenges with weak rationale** — a lightweight classifier detects dismissive/circular rationales. Founder is warned: "This rejection may accumulate decision debt. Are you sure?" with override option
3. **Contradictory decisions** — if the founder approves conflicting challenges in the same session, the system auto-creates a debt entry flagging the inconsistency

### Debt Model

```typescript
interface DecisionDebt {
  id: UUID;
  projectId: UUID;
  sessionId: UUID;
  challengeId: UUID;
  createdAt: DateTime;
  reviewDue: DateTime;
  severity: "blocker" | "major" | "minor";
  status: "open" | "resolved" | "acknowledged" | "escalated";
  resolvedAt: DateTime | null;
  resolutionNotes: string | null;
  escalationCount: number;
  tags: string[];                          // auto-tagged for pattern matching
  relatedDebts: UUID[];
}
```

### Surfacing Mechanisms

- **Session-start review**: At the beginning of each new session, unresolved blocker debts must be acknowledged before proceeding. Major debts shown as dismissible reminder.
- **Weekly digest**: Optional summary (Slack, email, CLI) lists all open debt entries sorted by age and severity
- **Pattern analysis**: Over time, the system identifies patterns: "You've deferred pricing-related decisions 4 times. Consider a dedicated pricing session."

### Escalation Rules

| Condition | Action |
|---|---|
| Debt older than 30 days, severity "blocker" | Unskippable interstitial before any new plan |
| Debt older than 60 days, any severity | "CRITICAL" tag in weekly digest |
| Same assumption challenged + deferred/rejected 3+ times | "Pattern Alert" with full historical context; founder must resolve definitively |
| Contradictory decisions detected | Immediate surface in current session |

---

## 6. Technical Architecture

### Model Selection

| Component | Recommended Model | Temperature | Rationale |
|---|---|---|---|
| **Specification — Extraction** | Claude Sonnet 4 / GPT-4o | 0.2 | Needs structured output + instruction following |
| **Specification — Verification** | Claude Haiku / GPT-4o-mini | 0.2 | Cheaper, faster; consistency check only |
| **Red-Team Personas** | Claude Sonnet 4 / GPT-4o | 0.7–0.9 | Needs creative adversarial reasoning |
| **Deduplication + Conflict** | Claude Haiku / GPT-4o-mini | 0.1 | Semantic similarity; deterministic |
| **Debt Classification** | Claude Haiku / fine-tuned classifier | — | Small-categorical classification |
| **Pattern Analysis** | Claude Sonnet 4 | 0.4 | Needs cross-session synthesis |

### Prompt Architecture

Each persona's system prompt is three layers:

```
[LAYER 1: BASE]     Shared across all personas
                     - Role in Friction
                     - Output format (Challenge schema)
                     - Style rules (be specific, no filler)

[LAYER 2: PERSONA]  Unique to each persona
                     - Core mandate and principles
                     - Question patterns
                     - Perspective-specific rules

[LAYER 3: SESSION]  Injected per session
                     - Project domain and history
                     - Relevant past debt entries
                     - Founder's challenge tolerance (configurable 1-5)
```

### Context Management

| Tier | Content | Always Included? |
|---|---|---|
| Tier 1 | System prompt + current plan | Yes |
| Tier 2 | Project summary + recent decisions | If fits in context window |
| Tier 3 | Full history, raw past sessions | On demand only |

Persona system prompts are candidates for Anthropic **prompt caching** since they're static across sessions.

### Security & Privacy

- **Local-first**: All data on founder's machine. Voice transcription uses local Whisper models
- **Data minimization**: Only necessary context sent to LLM providers; optional PII stripping
- **Encryption**: Decision log encrypted at rest (native disk encryption locally; envelope encryption if cloud-hosted)
- **No telemetry**: Zero external data collection by default

---

## 7. LLM Orchestration

### Execution Flow

```
1. Voice transcription (if applicable)
       │  blocking, external API call
       ▼
2. Specification Pass 1 (Extraction)
       │  sequential (Pass 2 depends on Pass 1)
       ▼
3. Specification Pass 2 (Verification)
       │  sequential
       ▼
4. Red-Team Personas (all 4+)
       │  PARALLEL fan-out — all personas run simultaneously
       ▼
5. Deduplication + Conflict Detection
       │  runs after all personas complete
       ▼
6. Decision Engine
       │  interactive, event-driven (waits for founder input)
       ▼
7. Pattern Analysis
       │  async, triggered after session completion
       ▼
8. Export to Execution Agents
```

### Retry & Idempotency

All LLM calls are wrapped with request deduplication. On network error, system retries with the same request ID. Results cached by request ID so retries produce identical results (no duplicate challenges).

### Temperature Strategy

- **Low (0.1–0.2)**: Specification, deduplication — need consistency and determinism
- **Moderate (0.4)**: Pattern analysis — needs structure + insight
- **High (0.7–0.9)**: Personas — needs creativity, divergent thinking, adversarial reasoning

---

## 8. State Management

### Session State Machine

```
[INIT] 
    │
    ▼
[SPECIFYING] ─────────────────► [SPEC_COMPLETE]
    │                                    │
    │ (founder provides input)           │ (plan validated)
    ▼                                    ▼
[SPEC_COMPLETE] ◄─────────────── [RED_TEAMING]
    │                                    │
    │ (clarifying questions)             │ (personas complete)
    ▼                                    ▼
[RED_TEAMING] ───────────────────► [CHALLENGES_READY]
                                         │
                                         │ (founder reviews)
                                         ▼
                                    [REVIEWING] ──────► [COMPLETED]
                                         │                    │
                                         │ (timeout/close)    │ (export)
                                         ▼                    ▼
                                    [ABANDONED]          [COMPLETED]
```

All state transitions are recorded with timestamps. Sessions support **resumption**: closing during `REVIEWING` persists state; `friction resume` restores it.

### Persistence

- **Local**: SQLite (default) — single-user, no infrastructure
- **Cloud**: PostgreSQL — migration path for multi-tenant scenarios
- Data model maps directly to database tables (see [data-model.md](./data-model.md))