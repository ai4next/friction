# Integration Guide

> How Friction connects with execution agents, project management tools, and external services.

## Table of Contents

1. [CLI Interface](#1-cli-interface)
2. [Execution Agent Integration](#2-execution-agent-integration)
3. [Project Management Tool Integration](#3-project-management-tool-integration)
4. [API Design (REST)](#4-api-design-rest)
5. [Notification Layer](#5-notification-layer)

---

## 1. CLI Interface

The primary user interface is a command-line tool (`friction`). The CLI is designed for a developer-founder workflow: fast, keyboard-driven, and composable with other CLI tools.

### Command Reference

```bash
# Project Management
friction project create <name> [--domain <domain>]
friction project list
friction project show <name>
friction project delete <name>

# Planning Sessions
friction plan <brief>                     # start a new planning session with text input
friction plan --voice                     # start with voice memo (opens recorder)
friction plan --file <path>               # start with written brief from file
friction resume [--session <id>]          # resume an incomplete session

# Persona Management
friction persona list                     # list available personas
friction persona create <name>            # create a custom persona
friction persona toggle <name>            # enable/disable a persona for current project
friction persona config <name> [options]  # configure persona parameters

# Review
friction review                           # review challenges for current session
friction review --challenge <id>          # review a specific challenge by ID
friction review --all                     # review all challenges for all sessions

# Decision Debt
friction debt list                        # show all decision debt
friction debt resolve <debt-id>           # mark a debt entry as resolved
friction debt patterns                    # show pattern analysis across sessions

# Export
friction export [--plan <path>] [--agent <agent>] [--format <format>]
friction export --plan ./plan.json --agent claude-code

# Utility
friction status                           # show current project and session status
friction config                           # show/edit configuration
friction version                          # show version
```

### Interactive Mode

During challenge review, the CLI enters interactive mode:

```
===========================================
CHALLENGE #3/6 [Customer Skeptic — MAJOR]
Targets: Assumption "Email capture is sufficient"
===========================================

"If users are like me, they ignore marketing emails entirely.
Your assumption that email is a reliable channel for activation
is contradicted by average open rates of 15-20% for cold startup
emails. Have you validated this with your specific audience?"

Evidence: Industry average email open rates (Campaign Monitor 2024)

Counter-proposal: Test SMS or in-app notifications as primary
channel, use email as fallback.

===========================================
[A]pprove  [M]odify  [R]eject  [D]efer  [S]kip  [?] help
```

### Output Formats

| Format | Use Case |
|---|---|
| **Terminal (default)** | Colorized, keyboard-driven, human-readable |
| **JSON** | `--format json` — for piping to other tools |
| **Markdown** | `--format markdown` — for saving to doc files |

---

## 2. Execution Agent Integration

Friction sits **before** execution agents, not inside them. Once a plan has passed through the Red-Team Layer, the validated output is exported for consumption by coding agents.

### Export Format

The exported plan is a JSON file with the following structure:

```jsonc
{
  "plan": {
    "title": "Launch waitlist page by Friday",
    "goals": [/* ... */],
    "constraints": [/* ... */]
  },
  "settled_decisions": [
    {
      "assumption": "Twitter is the primary acquisition channel",
      "challenge": "LinkedIn promotion needs 3-5 days lead time",
      "decision": "approved",
      "resolution": "Launch Friday with Twitter-only. LinkedIn promotion delayed to Monday."
    }
  ],
  "open_questions": [
    {
      "assumption": "Enterprise sales cycle is 2 months",
      "challenge": "Early-stage startups close in 1-4 weeks",
      "status": "deferred",
      "review_due": "2026-05-17"
    }
  ],
  "context": {
    "project_phase": "pre-launch",
    "team_size": 1
  }
}
```

### Claude Code Integration

Friction exports a validated context file that Claude Code consumes as project context:

```bash
friction export --agent claude-code --plan ./plan.json
# Produces: ./friction-plan.md — a CLAUDE.md-like file with:
# - Validated goals and constraints
# - Settled decisions (DO NOT RE-LITIGATE section)
# - Open questions to watch for
```

The execution agent prompt includes:

```
The following assumptions have been validated through adversarial review
and are considered settled for this implementation. Do not re-challenge
them unless you detect a direct technical impossibility.
```

### Other Agent Integration

| Agent | Integration Method |
|---|---|
| **Cursor** | Export as `.cursorrules` context file |
| **Bolt / Lovable** | Export as structured prompt for session initialization |
| **Replit AI** | Export as `.replit` context configuration |
| **Generic** | Export as plain markdown or JSON consumed by agent prompt |

### Feedback Loop

When execution agents discover contradictions between implementation reality and validated assumptions, they can flag back to Friction:

```
// In execution agent output:
/ SYNTHETIC-FRICTION-FEEDBACK
/ Assumption "Postgres will handle our scale" invalidated by implementation:
/ At estimated 50K users, write throughput exceeds single-node PG capacity.
/ Recommend revisiting this assumption.
/
```

This creates a new challenge in the relevant session's debt ledger.

---

## 3. Project Management Tool Integration

### Linear

| Action | Integration |
|---|---|
| **Blocker challenge created** | Auto-create Linear issue with: title = challenge headline, description = challenge body + evidence, priority = severity |
| **Decision recorded** | Append to Linear issue as comment |
| **Debt entry escalated** | Create or bump priority on existing Linear issue |
| **Session completed** | Create Linear project update with session summary |

**Endpoints used**: `issues.create`, `issueComment.create`, `projectUpdate.create`

### GitHub Issues

| Action | Integration |
|---|---|
| **Technical Debt Guardian blocker** | Create GitHub issue labeled `tech-debt` with severity badge |
| **Pattern alert generated** | Create GitHub issue labeled `decision-debt-pattern` |
| **Decision recorded affecting a tracked issue** | Comment on referenced issue |

**Endpoints used**: GitHub Issues API, GraphQL for label/comment management

### Notion

| Action | Integration |
|---|---|
| **Session completed** | Append structured session summary to Notion database page |
| **Decision debt digest** | Create Notion page in "Weekly Reviews" database |
| **Pattern analysis** | Create or update a "Decision Patterns" page with insights |

### MCP Integration

Friction can be exposed as an MCP (Model Context Protocol) server for AI-native IDEs to call directly:

```json
{
  "tools": [
    {
      "name": "friction_plan",
      "description": "Submit a plan for analysis",
      "inputSchema": { "plan": "string", "domain": "string" }
    },
    {
      "name": "friction_review",
      "description": "Get pending challenges",
      "inputSchema": { "sessionId": "string" }
    },
    {
      "name": "friction_decide",
      "description": "Respond to a challenge",
      "inputSchema": { "challengeId": "string", "action": "string", "rationale": "string" }
    },
    {
      "name": "friction_debt",
      "description": "List decision debt for a project",
      "inputSchema": { "projectId": "string" }
    }
  ]
}
```

This allows AI-native IDEs like Claude Code to use Friction as a built-in reasoning layer.

---

## 4. API Design (REST)

### Base URL

- **Local**: `http://localhost:9271` (or `http://localhost:{PORT}` from config)
- **Cloud** (future): `https://api.syntheticfriction.dev/{version}`

### Endpoints

#### Sessions

| Method | Path | Description |
|---|---|---|
| `POST` | `/sessions` | Create a new session with raw input |
| `GET` | `/sessions/{id}` | Get session status and summary |
| `GET` | `/sessions` | List sessions for a project |
| `PATCH` | `/sessions/{id}` | Update session state |

**POST /sessions**
```jsonc
// Request
{
  "projectId": "uuid",
  "rawInput": "I want to build...",
  "inputType": "text",               // "text" | "voice" | "hybrid"
  "voiceFile": null                  // base64-encoded audio if voice
}

// Response (201)
{
  "sessionId": "uuid",
  "status": "specifying",
  "createdAt": "2026-05-10T12:00:00Z"
}
```

**GET /sessions/{id}**
```jsonc
// Response
{
  "id": "uuid",
  "projectId": "uuid",
  "status": "reviewing",            // current state machine status
  "plan": { /* Plan object */ },
  "challengeCount": 14,
  "resolvedCount": 8,
  "completedAt": null,
  "debtCreated": 1
}
```

#### Plans

| Method | Path | Description |
|---|---|---|
| `GET` | `/sessions/{id}/plan` | Get the structured plan for a session |
| `PATCH` | `/sessions/{id}/plan` | Update plan (after modification) |

#### Challenges

| Method | Path | Description |
|---|---|---|
| `GET` | `/sessions/{id}/challenges` | Get all challenges, optionally grouped |
| `GET` | `/sessions/{id}/challenges/{challengeId}` | Get single challenge |

**GET /sessions/{id}/challenges**
```jsonc
// Query params: groupBy=assumption | persona | severity
// Response (groupBy=assumption)
{
  "challenges": [
    {
      "assumptionId": "uuid",
      "assumptionText": "Twitter is the best channel",
      "challenges": [
        {
          "id": "uuid",
          "persona": "devils_advocate",
          "severity": "blocker",
          "headline": "..."  
        }
      ]
    }
  ],
  "unresolvedCount": 6
}
```

#### Decisions

| Method | Path | Description |
|---|---|---|
| `POST` | `/sessions/{id}/decisions` | Submit a decision on a challenge |
| `GET` | `/sessions/{id}/decisions` | Get all decisions for a session |

**POST /sessions/{id}/decisions**
```jsonc
// Request
{
  "challengeId": "uuid",
  "action": "approved",            // "approved" | "modified" | "rejected" | "deferred" | "skipped"
  "rationale": "Good catch. We'll delay LinkedIn promotion.",
  "modifiedAssumption": null
}

// Response (201)
{
  "decisionId": "uuid",
  "debtAccrued": false,
  "debtId": null,
  "remainingChallenges": 5
}
```

#### Decision Debt

| Method | Path | Description |
|---|---|---|
| `GET` | `/projects/{id}/debt` | List all decision debt for a project |
| `GET` | `/projects/{id}/debt/{debtId}` | Get specific debt entry |
| `PATCH` | `/projects/{id}/debt/{debtId}` | Update debt status |
| `GET` | `/projects/{id}/patterns` | Get pattern analysis insights |

**GET /projects/{id}/patterns**
```jsonc
// Response
{
  "patterns": [
    {
      "pattern": "pricing_avoidance",
      "description": "You've deferred pricing-related decisions 3 times across 2 sessions.",
      "relatedDebtIds": ["uuid1", "uuid2", "uuid3"],
      "suggestion": "Consider scheduling a dedicated pricing strategy session."
    },
    {
      "pattern": "retention_disregard",
      "description": "User retention assumptions were rejected 4 times without evidence.",
      "relatedDebtIds": ["uuid4", "uuid5"],
      "suggestion": "Your churn data from last quarter suggests these concerns were valid."
    }
  ]
}
```

#### Export

| Method | Path | Description |
|---|---|---|
| `POST` | `/sessions/{id}/export` | Export validated plan in specified format |
| `GET` | `/sessions/{id}/export/{format}` | Download exported plan |

### Pagination

List endpoints support cursor-based pagination:

```
GET /projects/{id}/debt?cursor=abc123&limit=20
```

### Error Handling

```jsonc
{
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Session with id 'xyz' not found",
    "details": { "sessionId": "xyz" }
  }
}
```

Standard HTTP status codes: 200 OK, 201 Created, 400 Bad Request, 404 Not Found, 409 Conflict, 500 Internal Error.

---

## 5. Notification Layer

### Digest Types

| Digest | Frequency | Content | Delivery |
|---|---|---|---|
| **Session Complete** | On event | Summary: challenges reviewed, decisions made, debt created | CLI output, optional Slack message |
| **Weekly Debt Digest** | Weekly (configurable) | All open debt entries sorted by age + severity, approaching review dates | Email, Slack, or CLI on startup |
| **Escalation Alert** | On event | Debt entry escalated due to aging | Email or Slack (urgent) |
| **Pattern Alert** | On detection | Pattern detected across sessions | Email or Slack with full historical context |
| **Review Reminder** | Before review due | X hours before a debt entry's reviewDue date | CLI notification or Slack message |

### Delivery Channels

- **CLI**: Primary channel (shown at session start, on `friction debt list`, or on `friction status`)
- **Slack**: Optional via Slack webhook
- **Email**: Optional via SMTP (for cloud deployment)
- **Local notification**: macOS notification center (via `osascript`) for desktop alerts

### Configuration

```bash
friction config set notifications.slack.webhook "https://hooks.slack.com/..."
friction config set notifications.weekly-digest.enabled true
friction config set notifications.weekly-digest.day "Monday"
friction config set notifications.weekly-digest.time "09:00"
friction config set notifications.review-reminder.lead-time "24h"
```