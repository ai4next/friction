# Friction

**The Solo Founder's Co-Founder AI**

Friction is a structured AI reasoning layer that doesn't just execute tasks — it actively challenges your assumptions, red-teams decisions, and surfaces blindspots. While existing AI tools optimize for speed and obedience, Friction optimizes for **productive disagreement**, turning the loneliness of sole decision-making into a competitive advantage.

## Why Friction?

Solo founders face a structural disadvantage: no co-founder to argue with. Every decision is a monologue, not a debate. Assumptions go unchecked, blindspots compound, and the first external reality check often comes too late — from a failed launch, a churned customer, or a burned-out team.

Existing AI coding agents accelerate execution but amplify this problem. Faster execution on wrong assumptions means faster failure. Friction sits *before* execution, giving solo founders the sparring partner they're missing.

## Core Concept

```
YOU (the founder)                          Friction

"Idea / brief / plan"                      
        │                                          
        ▼                                          
                              ┌─────────────────────┐
                              │  SPECIFICATION LAYER │
                              │  Parses your input   │
                              │  into structured     │
                              │  assumptions & goals │
                              └─────────┬───────────┘
                                        │
                              ┌─────────▼───────────┐
                              │  RED-TEAM LAYER      │
                              │  4 personas critique │
                              │  the plan in parallel│
                              │  • Devil's Advocate  │
                              │  • Domain Expert     │
                              │  • Customer Skeptic  │
                              │  • Tech Debt Guardian│
                              └─────────┬───────────┘
                                        │
            ◄─────── challenges ────────┘
            ─────── decisions ────────►
                                        │
                              ┌─────────▼───────────┐
                              │  DECISION ENGINE     │
                              │  Approve / Modify /  │
                              │  Reject / Defer      │
                              └─────────┬───────────┘
                                        │
                              ┌─────────▼───────────┐
                              │  DECISION DEBT       │
                              │  Unresolved          │
                              │  challenges tracked  │
                              │  over time           │
                              └─────────────────────┘
                                        │
                                        ▼
                              Execution Agents
                           (Claude Code, Cursor, etc.)
```

## How It Works

1. **You describe your plan** — a voice memo or written brief about what you want to build and why
2. **Specification Layer** parses it into structured assumptions, goals, constraints, and acceptance criteria — making the implicit explicit
3. **Red-Team Layer** dispatches your plan to 4 specialized AI personas in parallel, each generating independent critiques
4. **You review each challenge** — approve valid critiques to update your plan, modify assumptions, reject with rationale, or defer for later
5. **Decision Debt System** tracks unresolved challenges over time, surfacing them at the right moments and detecting patterns across your decision history
6. **Validated plan** is exported to your execution agent of choice with settled decisions marked as resolved

## Quick Start

```bash
# Create a new project
friction project create "Raven" --domain "B2B SaaS"

# Start a planning session
friction plan "We need to build an analytics dashboard. Launch in 2 weeks..."

# Challenges will appear. Review them:
# [A]pprove  [M]odify  [R]eject  [D]efer  [S]kip

# Export validated plan to Claude Code
friction export --plan ./plans/waitlist-page.json --agent claude-code
```

## Core Concepts

| Concept | Description |
|---|---|
| **Structured Plan** | Your raw input parsed into assumptions, goals, constraints, and criteria |
| **Challenge** | A persona's critique targeted at a specific assumption or goal |
| **Decision Debt** | Unresolved challenges that accumulate and resurface over time |
| **Persona** | An AI agent with a distinct perspective (Devil's Advocate, etc.) |

## Status

Friction is in architecture/design phase. See `/docs` for the full design documentation.

## License

MIT