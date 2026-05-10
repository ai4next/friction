# Data Model

> Complete entity definitions, relationships, and state machines for Friction.

## Table of Contents

1. [Entity Relationship Diagram](#1-entity-relationship-diagram)
2. [Core Entities](#2-core-entities)
3. [State Machines](#3-state-machines)
4. [Persistence Strategy](#4-persistence-strategy)

---

## 1. Entity Relationship Diagram

```
Project 1──────* Session

Session 1──────1 Plan
Session 1──────* Challenge
Session 1──────* Decision
Session 1──────* DecisionDebt

Plan    1──────* Assumption
Plan    1──────* Goal
Plan    1──────* Constraint
Plan    1──────* Criterion

Challenge *──────1 Persona
Challenge *──────* Assumption  (many-to-many via target refs)
Challenge 0──────* Challenge   (self-referencing via conflictWith)

Decision *──────1 Challenge
Decision 0──────1 Assumption   (modified assumption, nullable)

DecisionDebt *──────1 Challenge
DecisionDebt *──────* DecisionDebt (self-referencing via relatedDebts)

Project *──────* Persona      (via active_personas config)
```

---

## 2. Core Entities

### Project

```typescript
interface Project {
  id: UUID;
  name: string;
  description: string | null;
  domain: string;                   // "B2B SaaS", "consumer", "healthcare", etc.
  createdAt: DateTime;
  updatedAt: DateTime;
  activePersonas: PersonaConfig[];  // which personas and their config
}
```

### Session

```typescript
interface Session {
  id: UUID;
  projectId: UUID;
  status: SessionStatus;            // see state machine
  rawInput: string;
  rawInputType: "voice" | "text" | "hybrid";
  createdAt: DateTime;
  completedAt: DateTime | null;
  planId: UUID | null;
  challengeCount: number;
  unresolvedDebtFromPrior: UUID[];  // debt entries surfaced at session start
}
```

### Plan

```typescript
interface Plan {
  id: UUID;
  sessionId: UUID;
  title: string;
  rawInput: string;                 // original transcript or text
  founderConfidence: Record<string, number>;  // goal_id → 1-10
  context: PlanContext;
  createdAt: DateTime;
  version: number;                  // incremented on modification
}

interface PlanContext {
  projectPhase: "ideation" | "pre-launch" | "growth" | "scale";
  teamSize: number;
  runwayMonths: number | null;
  priorDecisions: UUID[];
}
```

### Assumption

```typescript
interface Assumption {
  id: UUID;
  planId: UUID;
  text: string;
  source: "explicit" | "extracted";
  sourceQuote: string | null;       // exact phrase from raw input if extracted
  category: 
    | "market" 
    | "technical" 
    | "user_behavior" 
    | "financial" 
    | "timeline";
  extractionConfidence: number;     // 1-10
  status: 
    | "unchallenged" 
    | "challenged" 
    | "validated" 
    | "invalidated" 
    | "modified";
}
```

### Goal

```typescript
interface Goal {
  id: UUID;
  planId: UUID;
  text: string;
  priority: "must_have" | "should_have" | "nice_to_have";
  successMetric: string | null;     // e.g., "100 signups in first week"
  deadline: Date | null;
}
```

### Constraint

```typescript
interface Constraint {
  id: UUID;
  planId: UUID;
  text: string;
  type: "time" | "budget" | "technical" | "regulatory" | "resource" | "other";
  isHard: boolean;                  // hard constraints cannot be violated
}
```

### Criterion

```typescript
interface Criterion {
  id: UUID;
  planId: UUID;
  text: string;
  measurable: boolean;
  measurementMethod: string | null; // e.g., "Lighthouse score < 2s on mobile 3G"
}
```

### Persona

```typescript
interface Persona {
  id: UUID;
  name: string;                     // "devils_advocate", "domain_expert", etc.
  displayName: string;              // "Devil's Advocate"
  description: string;
  isCustom: boolean;
  systemPrompt: string;             // the full system prompt (Layer 1 + Layer 2)
  domain: string | null;            // only for domain_expert
  config: {
    temperature: number;            // 0.7-0.9 for personas
    focusCategories: string[];      // which assumption categories this targets
  };
}
```

### Challenge

```typescript
interface Challenge {
  id: UUID;
  sessionId: UUID;
  personaId: UUID;
  personaName: string;              // denormalized for display
  targets: UUID[];                  // assumption_ids, goal_ids, constraint_ids
  severity: "blocker" | "major" | "minor" | "informational";
  category: 
    | "assumption_inversion" 
    | "gap_identified" 
    | "risk_flag" 
    | "alternative_approach";
  headline: string;                 // one-line summary
  body: string;                     // detailed argument (1-3 paragraphs)
  evidence: string | null;
  counterProposal: string | null;
  personaConfidence: number;        // 1-10
  relatedPastDecisions: UUID[];
  conflictWith: UUID[];             // other challenges this contradicts
  status: "pending" | "resolved" | "deferred" | "rejected";
}
```

### Decision

```typescript
interface Decision {
  id: UUID;
  sessionId: UUID;
  challengeId: UUID;
  action: "approved" | "modified" | "rejected" | "deferred" | "skipped";
  rationale: string;
  modifiedAssumptionId: UUID | null;
  modifiedAssumptionText: string | null;
  debtAccrued: boolean;
  debtId: UUID | null;
  createdAt: DateTime;
}
```

### DecisionDebt

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
  tags: string[];                   // auto-generated for pattern matching
  relatedDebts: UUID[];
}
```

---

## 3. State Machines

### Session State Machine

```
                    ┌──────────────────────────────┐
                    │            INIT               │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
              ┌─────│         SPECIFYING            │─────┐
              │     │  (founder provides input)     │     │
              │     └──────────────┬───────────────┘     │
              │                    │                      │
              │   (clarifying      │ (spec complete)      │ (30m
              │    questions)      ▼                      │  timeout)
              │     ┌──────────────────────────────┐     │
              │     │       SPEC_COMPLETE           │     │
              │     │  (plan validated)            │     │
              │     └──────────────┬───────────────┘     │
              │                    │                      │
              │                    ▼                      │
              │     ┌──────────────────────────────┐     │
              │     │       RED_TEAMING             │     │
              │     │  (personas running)           │     │
              │     └──────────────┬───────────────┘     │
              │                    │                      │
              │                    ▼                      │
              │     ┌──────────────────────────────┐     │
              │     │      CHALLENGES_READY         │     │
              │     │  (challenges generated)      │     │
              │     └──────────────┬───────────────┘     │
              │                    │                      │
              │                    ▼                      │
              │     ┌──────────────────────────────┐     │
              │     │        REVIEWING              │     │
              │     │  (founder reviewing)          │─────┤
              │     └──────────────┬───────────────┘     │
              │                    │                      │
              │                    ▼                      ▼
              │     ┌──────────────────────────────┐ ┌──────────┐
              └─────│        COMPLETED              │ │ABANDONED │
                    │  (session done, exported)     │ │          │
                    └──────────────────────────────┘ └──────────┘
```

### DecisionDebt Status Machine

```
    ┌──────────┐       ┌──────────────┐
    │   OPEN   │──────►│  RESOLVED    │
    └────┬─────┘      └──────────────┘
         │
         │ (30 days unresolved, severity blocker)
         ▼
    ┌──────────┐       ┌──────────────┐
    │ESCALATED │──────►│  RESOLVED    │
    └────┬─────┘       └──────────────┘
         │
         │ (founder acknowledges without resolving)
         ▼
    ┌──────────────┐
    │ACKNOWLEDGED  │
    └──────────────┘
```

Transitions:
- **OPEN → RESOLVED**: Founder revisits and resolves the challenge
- **OPEN → ESCALATED**: Debt older than 30 days with blocker severity
- **ESCALATED → RESOLVED**: Founder resolves during forced review
- **ESCALATED → ACKNOWLEDGED**: Founder acknowledges but defers again (increments escalation count)
- **ACKNOWLEDGED → ESCALATED**: Further aging without resolution

---

## 4. Persistence Strategy

### Local Deployment (Default)

**Database**: SQLite

Benefits:
- Zero setup, no infrastructure
- All data stays on the founder's machine
- File-based, easy to back up
- Suitable for single-user usage

Migration path to PostgreSQL documented for multi-tenant or cloud scenarios.

### Storage Layout

```
~/.friction/
├── projects/
│   ├── {project_id}/
│   │   ├── sessions/
│   │   │   ├── {session_id}.json   # session data (plan, challenges, decisions)
│   │   │   └── raw/                # raw input files (voice, text)
│   │   └── debt.db                 # decision debt ledger (SQLite)
│   └── ...
├── personas/
│   ├── built-in/                    # read-only, shipped with the tool
│   │   ├── devils_advocate.json
│   │   ├── domain_expert.json
│   │   ├── customer_skeptic.json
│   │   └── tech_debt_guardian.json
│   └── custom/                      # user-created personas
│       └── ...
└── config.json                      # global settings
```

### Data Retention

| Data | Retention |
|---|---|
| Raw input (voice memo) | Until session completed (deleted after transcription) |
| Structured plan | Permanent (needed for decision debt context) |
| Challenges + Decisions | Permanent (append-only log) |
| Decision debt | Permanent until resolved (+ 6 months after resolution for pattern analysis) |
| Session state | Until completed or abandoned for 90 days |

### Encryption

- **At rest**: SQLite file encrypted using platform-native encryption (macOS FileVault, Linux LUKS, Windows BitLocker). Explicit encryption key file supported
- **Decision log**: Additional envelope encryption recommended for the debt ledger (founder controls the key)
- **In transit**: Standard TLS for API calls to LLM providers