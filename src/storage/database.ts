import BetterSqlite3 from 'better-sqlite3';
import { getDbPath } from './paths.js';
import type {
  Project, Session, Plan, Assumption, Goal, Constraint, Criterion,
  Challenge, Decision, DecisionDebt, Persona, PersonaConfig,
  SessionStatus, DebtStatus,
  AssumptionStatus, ChallengeStatus, DecisionAction,
  UUID,
} from '../types.js';

let db: BetterSqlite3.Database;

export function getDb(): BetterSqlite3.Database {
  if (!db) {
    db = new BetterSqlite3(getDbPath());
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(database: BetterSqlite3.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      domain TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_personas (
      project_id TEXT NOT NULL,
      persona_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      config TEXT,
      PRIMARY KEY (project_id, persona_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'init',
      raw_input TEXT NOT NULL DEFAULT '',
      raw_input_type TEXT NOT NULL DEFAULT 'text',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      plan_id TEXT,
      challenge_count INTEGER NOT NULL DEFAULT 0,
      unresolved_debt TEXT NOT NULL DEFAULT '[]',
      current_challenge_index INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      raw_input TEXT NOT NULL,
      founder_confidence TEXT NOT NULL DEFAULT '{}',
      context TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assumptions (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      text TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'extracted',
      source_quote TEXT,
      category TEXT NOT NULL DEFAULT 'market',
      extraction_confidence INTEGER NOT NULL DEFAULT 5,
      status TEXT NOT NULL DEFAULT 'unchallenged',
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      text TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'should_have',
      success_metric TEXT,
      deadline TEXT,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS constraints (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      text TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'other',
      is_hard INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS criteria (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      text TEXT NOT NULL,
      measurable INTEGER NOT NULL DEFAULT 0,
      measurement_method TEXT,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS personas (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT NOT NULL,
      is_custom INTEGER NOT NULL DEFAULT 0,
      system_prompt TEXT NOT NULL,
      domain TEXT,
      temperature REAL NOT NULL DEFAULT 0.8,
      focus_categories TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      persona_id TEXT NOT NULL,
      persona_name TEXT NOT NULL,
      targets TEXT NOT NULL DEFAULT '[]',
      severity TEXT NOT NULL DEFAULT 'minor',
      category TEXT NOT NULL DEFAULT 'risk_flag',
      headline TEXT NOT NULL,
      body TEXT NOT NULL,
      evidence TEXT,
      counter_proposal TEXT,
      persona_confidence INTEGER NOT NULL DEFAULT 5,
      related_past_decisions TEXT NOT NULL DEFAULT '[]',
      conflict_with TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      target_type TEXT,
      target_text TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (persona_id) REFERENCES personas(id)
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      challenge_id TEXT NOT NULL,
      action TEXT NOT NULL,
      rationale TEXT NOT NULL,
      modified_assumption_id TEXT,
      modified_assumption_text TEXT,
      debt_accrued INTEGER NOT NULL DEFAULT 0,
      debt_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (challenge_id) REFERENCES challenges(id)
    );

    CREATE TABLE IF NOT EXISTS decision_debt (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      challenge_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      review_due TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'minor',
      status TEXT NOT NULL DEFAULT 'open',
      resolved_at TEXT,
      resolution_notes TEXT,
      escalation_count INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]',
      related_debts TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (challenge_id) REFERENCES challenges(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_plans_session ON plans(session_id);
    CREATE INDEX IF NOT EXISTS idx_challenges_session ON challenges(session_id);
    CREATE INDEX IF NOT EXISTS idx_decisions_session ON decisions(session_id);
    CREATE INDEX IF NOT EXISTS idx_debt_project ON decision_debt(project_id);
    CREATE INDEX IF NOT EXISTS idx_debt_status ON decision_debt(status);
  `);
}

// ====== Project CRUD ======

export function insertProject(project: Project): void {
  const dbc = getDb();
  dbc.prepare(`INSERT INTO projects (id, name, description, domain, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(project.id, project.name, project.description, project.domain, project.createdAt.toISOString(), project.updatedAt.toISOString());

  for (const p of project.activePersonas) {
    dbc.prepare(`INSERT INTO project_personas (project_id, persona_id, enabled, config)
      VALUES (?, ?, ?, ?)`).run(project.id, p.personaId, p.enabled ? 1 : 0, p.config ? JSON.stringify(p.config) : null);
  }
}

export function getProjectById(id: UUID): Project | null {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToProject(row);
}

export function getProjectByName(name: string): Project | null {
  const row = getDb().prepare('SELECT * FROM projects WHERE name = ?').get(name) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToProject(row);
}

export function listProjects(): Project[] {
  const rows = getDb().prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return rows.map(rowToProject);
}

export function deleteProject(id: UUID): void {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
}

export function updateProjectTimestamp(id: UUID): void {
  getDb().prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(id);
}

function rowToProject(row: Record<string, unknown>): Project {
  const personaRows = getDb().prepare('SELECT * FROM project_personas WHERE project_id = ?').all(row.id) as Record<string, unknown>[];
  return {
    id: row.id as UUID,
    name: row.name as string,
    description: row.description as string | null,
    domain: row.domain as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    activePersonas: personaRows.map((pr) => ({
      personaId: pr.persona_id as UUID,
      enabled: Boolean(pr.enabled),
      config: pr.config ? JSON.parse(pr.config as string) : undefined,
    })),
  };
}

// ====== Session CRUD ======

export function insertSession(session: Session): void {
  getDb().prepare(`INSERT INTO sessions (id, project_id, status, raw_input, raw_input_type, created_at, completed_at, plan_id, challenge_count, unresolved_debt, current_challenge_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    session.id, session.projectId, session.status, session.rawInput, session.rawInputType,
    session.createdAt.toISOString(), session.completedAt?.toISOString() || null,
    session.planId, session.challengeCount, JSON.stringify(session.unresolvedDebtFromPrior),
    session.currentChallengeIndex,
  );
}

export function getSessionById(id: UUID): Session | null {
  const row = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToSession(row);
}

export function getLatestSession(projectId: UUID): Session | null {
  const row = getDb().prepare('SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC LIMIT 1').get(projectId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToSession(row);
}

export function getActiveSession(projectId: UUID): Session | null {
  const row = getDb().prepare(
    "SELECT * FROM sessions WHERE project_id = ? AND status NOT IN ('completed', 'abandoned') ORDER BY created_at DESC LIMIT 1"
  ).get(projectId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToSession(row);
}

export function updateSessionStatus(id: UUID, status: SessionStatus): void {
  getDb().prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, id);
}

export function updateSessionChallengeIndex(id: UUID, index: number): void {
  getDb().prepare('UPDATE sessions SET current_challenge_index = ? WHERE id = ?').run(index, id);
}

export function updateSessionPlanId(id: UUID, planId: UUID): void {
  getDb().prepare('UPDATE sessions SET plan_id = ? WHERE id = ?').run(planId, id);
}

export function completeSession(id: UUID): void {
  getDb().prepare("UPDATE sessions SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(id);
}

function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as UUID,
    projectId: row.project_id as UUID,
    status: row.status as SessionStatus,
    rawInput: row.raw_input as string,
    rawInputType: row.raw_input_type as 'voice' | 'text' | 'hybrid',
    createdAt: new Date(row.created_at as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    planId: row.plan_id as UUID | null,
    challengeCount: row.challenge_count as number,
    unresolvedDebtFromPrior: JSON.parse(row.unresolved_debt as string) as UUID[],
    currentChallengeIndex: row.current_challenge_index as number,
  };
}

// ====== Plan CRUD ======

export function insertPlan(plan: Plan): void {
  getDb().prepare(`INSERT INTO plans (id, session_id, title, raw_input, founder_confidence, context, created_at, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    plan.id, plan.sessionId, plan.title, plan.rawInput,
    JSON.stringify(plan.founderConfidence), JSON.stringify(plan.context),
    plan.createdAt.toISOString(), plan.version,
  );
}

export function getPlanById(id: UUID): Plan | null {
  const row = getDb().prepare('SELECT * FROM plans WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToPlan(row);
}

export function getPlanBySessionId(sessionId: UUID): Plan | null {
  const row = getDb().prepare('SELECT * FROM plans WHERE session_id = ? ORDER BY version DESC LIMIT 1').get(sessionId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToPlan(row);
}

export function updatePlanVersion(id: UUID, version: number): void {
  getDb().prepare('UPDATE plans SET version = ? WHERE id = ?').run(version, id);
}

function rowToPlan(row: Record<string, unknown>): Plan {
  return {
    id: row.id as UUID,
    sessionId: row.session_id as UUID,
    title: row.title as string,
    rawInput: row.raw_input as string,
    founderConfidence: JSON.parse(row.founder_confidence as string) as Record<string, number>,
    context: JSON.parse(row.context as string) as Plan['context'],
    createdAt: new Date(row.created_at as string),
    version: row.version as number,
  };
}

// ====== Assumption CRUD ======

export function insertAssumptions(assumptions: Assumption[]): void {
  const stmt = getDb().prepare(`INSERT INTO assumptions (id, plan_id, text, source, source_quote, category, extraction_confidence, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const a of assumptions) {
    stmt.run(a.id, a.planId, a.text, a.source, a.sourceQuote, a.category, a.extractionConfidence, a.status);
  }
}

export function getAssumptionsByPlanId(planId: UUID): Assumption[] {
  const rows = getDb().prepare('SELECT * FROM assumptions WHERE plan_id = ?').all(planId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as UUID,
    planId: r.plan_id as UUID,
    text: r.text as string,
    source: r.source as Assumption['source'],
    sourceQuote: r.source_quote as string | null,
    category: r.category as Assumption['category'],
    extractionConfidence: r.extraction_confidence as number,
    status: r.status as AssumptionStatus,
  }));
}

export function updateAssumptionStatus(id: UUID, status: AssumptionStatus): void {
  getDb().prepare('UPDATE assumptions SET status = ? WHERE id = ?').run(status, id);
}

// ====== Goal CRUD ======

export function insertGoals(goals: Goal[]): void {
  const stmt = getDb().prepare(`INSERT INTO goals (id, plan_id, text, priority, success_metric, deadline)
    VALUES (?, ?, ?, ?, ?, ?)`);
  for (const g of goals) {
    stmt.run(g.id, g.planId, g.text, g.priority, g.successMetric, g.deadline?.toISOString() || null);
  }
}

export function getGoalsByPlanId(planId: UUID): Goal[] {
  const rows = getDb().prepare('SELECT * FROM goals WHERE plan_id = ?').all(planId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as UUID,
    planId: r.plan_id as UUID,
    text: r.text as string,
    priority: r.priority as Goal['priority'],
    successMetric: r.success_metric as string | null,
    deadline: r.deadline ? new Date(r.deadline as string) : null,
  }));
}

// ====== Constraint CRUD ======

export function insertConstraints(constraints: Constraint[]): void {
  const stmt = getDb().prepare(`INSERT INTO constraints (id, plan_id, text, type, is_hard)
    VALUES (?, ?, ?, ?, ?)`);
  for (const c of constraints) {
    stmt.run(c.id, c.planId, c.text, c.type, c.isHard ? 1 : 0);
  }
}

export function getConstraintsByPlanId(planId: UUID): Constraint[] {
  const rows = getDb().prepare('SELECT * FROM constraints WHERE plan_id = ?').all(planId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as UUID,
    planId: r.plan_id as UUID,
    text: r.text as string,
    type: r.type as Constraint['type'],
    isHard: Boolean(r.is_hard),
  }));
}

// ====== Criterion CRUD ======

export function insertCriteria(criteria: Criterion[]): void {
  const stmt = getDb().prepare(`INSERT INTO criteria (id, plan_id, text, measurable, measurement_method)
    VALUES (?, ?, ?, ?, ?)`);
  for (const c of criteria) {
    stmt.run(c.id, c.planId, c.text, c.measurable ? 1 : 0, c.measurementMethod);
  }
}

export function getCriteriaByPlanId(planId: UUID): Criterion[] {
  const rows = getDb().prepare('SELECT * FROM criteria WHERE plan_id = ?').all(planId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as UUID,
    planId: r.plan_id as UUID,
    text: r.text as string,
    measurable: Boolean(r.measurable),
    measurementMethod: r.measurement_method as string | null,
  }));
}

// ====== Persona CRUD ======

export function insertPersona(persona: Persona): void {
  getDb().prepare(`INSERT INTO personas (id, name, display_name, description, is_custom, system_prompt, domain, temperature, focus_categories)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    persona.id, persona.name, persona.displayName, persona.description,
    persona.isCustom ? 1 : 0, persona.systemPrompt, persona.domain,
    persona.config.temperature, JSON.stringify(persona.config.focusCategories),
  );
}

export function getPersonaById(id: UUID): Persona | null {
  const row = getDb().prepare('SELECT * FROM personas WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToPersona(row);
}

export function getPersonaByName(name: string): Persona | null {
  const row = getDb().prepare('SELECT * FROM personas WHERE name = ?').get(name) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToPersona(row);
}

export function listPersonas(): Persona[] {
  const rows = getDb().prepare('SELECT * FROM personas ORDER BY is_custom, name').all() as Record<string, unknown>[];
  return rows.map(rowToPersona);
}

export function deletePersona(id: UUID): void {
  getDb().prepare('DELETE FROM personas WHERE id = ?').run(id);
}

function rowToPersona(row: Record<string, unknown>): Persona {
  return {
    id: row.id as UUID,
    name: row.name as string,
    displayName: row.display_name as string,
    description: row.description as string,
    isCustom: Boolean(row.is_custom),
    systemPrompt: row.system_prompt as string,
    domain: row.domain as string | null,
    config: {
      temperature: row.temperature as number,
      focusCategories: JSON.parse(row.focus_categories as string) as string[],
    },
  };
}

// ====== Challenge CRUD ======

export function insertChallenge(challenge: Challenge): void {
  getDb().prepare(`INSERT INTO challenges (id, session_id, persona_id, persona_name, targets, severity, category, headline, body, evidence, counter_proposal, persona_confidence, related_past_decisions, conflict_with, status, target_type, target_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    challenge.id, challenge.sessionId, challenge.personaId, challenge.personaName,
    JSON.stringify(challenge.targets), challenge.severity, challenge.category,
    challenge.headline, challenge.body, challenge.evidence, challenge.counterProposal,
    challenge.personaConfidence, JSON.stringify(challenge.relatedPastDecisions),
    JSON.stringify(challenge.conflictWith), challenge.status,
    challenge.targetType || null, challenge.targetText || null,
  );
}

export function insertChallenges(challenges: Challenge[]): void {
  for (const c of challenges) {
    insertChallenge(c);
  }
}

export function getChallengesBySessionId(sessionId: UUID): Challenge[] {
  const rows = getDb().prepare('SELECT * FROM challenges WHERE session_id = ? ORDER BY severity ASC').all(sessionId) as Record<string, unknown>[];
  return rows.map(rowToChallenge);
}

export function getChallengeById(id: UUID): Challenge | null {
  const row = getDb().prepare('SELECT * FROM challenges WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToChallenge(row);
}

export function getUnresolvedChallenges(sessionId: UUID): Challenge[] {
  const rows = getDb().prepare(
    "SELECT * FROM challenges WHERE session_id = ? AND status = 'pending' ORDER BY severity ASC"
  ).all(sessionId) as Record<string, unknown>[];
  return rows.map(rowToChallenge);
}

export function updateChallengeStatus(id: UUID, status: ChallengeStatus): void {
  getDb().prepare('UPDATE challenges SET status = ? WHERE id = ?').run(status, id);
}

function rowToChallenge(row: Record<string, unknown>): Challenge {
  return {
    id: row.id as UUID,
    sessionId: row.session_id as UUID,
    personaId: row.persona_id as UUID,
    personaName: row.persona_name as string,
    targets: JSON.parse(row.targets as string) as UUID[],
    severity: row.severity as Challenge['severity'],
    category: row.category as Challenge['category'],
    headline: row.headline as string,
    body: row.body as string,
    evidence: row.evidence as string | null,
    counterProposal: row.counter_proposal as string | null,
    personaConfidence: row.persona_confidence as number,
    relatedPastDecisions: JSON.parse(row.related_past_decisions as string) as UUID[],
    conflictWith: JSON.parse(row.conflict_with as string) as UUID[],
    status: row.status as ChallengeStatus,
    targetType: row.target_type as Challenge['targetType'],
    targetText: row.target_text as Challenge['targetText'],
  };
}

// ====== Decision CRUD ======

export function insertDecision(decision: Decision): void {
  getDb().prepare(`INSERT INTO decisions (id, session_id, challenge_id, action, rationale, modified_assumption_id, modified_assumption_text, debt_accrued, debt_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    decision.id, decision.sessionId, decision.challengeId, decision.action,
    decision.rationale, decision.modifiedAssumptionId, decision.modifiedAssumptionText,
    decision.debtAccrued ? 1 : 0, decision.debtId, decision.createdAt.toISOString(),
  );
}

export function getDecisionsBySessionId(sessionId: UUID): Decision[] {
  const rows = getDb().prepare('SELECT * FROM decisions WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as UUID,
    sessionId: r.session_id as UUID,
    challengeId: r.challenge_id as UUID,
    action: r.action as DecisionAction,
    rationale: r.rationale as string,
    modifiedAssumptionId: r.modified_assumption_id as UUID | null,
    modifiedAssumptionText: r.modified_assumption_text as string | null,
    debtAccrued: Boolean(r.debt_accrued),
    debtId: r.debt_id as UUID | null,
    createdAt: new Date(r.created_at as string),
  }));
}

// ====== DecisionDebt CRUD ======

export function insertDecisionDebt(debt: DecisionDebt): void {
  getDb().prepare(`INSERT INTO decision_debt (id, project_id, session_id, challenge_id, created_at, review_due, severity, status, resolved_at, resolution_notes, escalation_count, tags, related_debts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    debt.id, debt.projectId, debt.sessionId, debt.challengeId,
    debt.createdAt.toISOString(), debt.reviewDue.toISOString(),
    debt.severity, debt.status, debt.resolvedAt?.toISOString() || null,
    debt.resolutionNotes, debt.escalationCount,
    JSON.stringify(debt.tags), JSON.stringify(debt.relatedDebts),
  );
}

export function getDebtByProjectId(projectId: UUID): DecisionDebt[] {
  const rows = getDb().prepare('SELECT * FROM decision_debt WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as Record<string, unknown>[];
  return rows.map(rowToDebt);
}

export function getOpenDebt(projectId: UUID): DecisionDebt[] {
  const rows = getDb().prepare(
    "SELECT * FROM decision_debt WHERE project_id = ? AND status IN ('open', 'acknowledged', 'escalated') ORDER BY severity ASC, review_due ASC"
  ).all(projectId) as Record<string, unknown>[];
  return rows.map(rowToDebt);
}

export function getDebtById(id: UUID): DecisionDebt | null {
  const row = getDb().prepare('SELECT * FROM decision_debt WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToDebt(row);
}

export function updateDebtStatus(id: UUID, status: DebtStatus, resolutionNotes?: string): void {
  const notes = resolutionNotes || null;
  if (status === 'resolved') {
    getDb().prepare("UPDATE decision_debt SET status = ?, resolved_at = datetime('now'), resolution_notes = ? WHERE id = ?").run(status, notes, id);
  } else {
    getDb().prepare('UPDATE decision_debt SET status = ?, resolution_notes = ? WHERE id = ?').run(status, notes, id);
  }
}

export function incrementDebtEscalation(id: UUID): void {
  getDb().prepare('UPDATE decision_debt SET escalation_count = escalation_count + 1 WHERE id = ?').run(id);
}

function rowToDebt(row: Record<string, unknown>): DecisionDebt {
  return {
    id: row.id as UUID,
    projectId: row.project_id as UUID,
    sessionId: row.session_id as UUID,
    challengeId: row.challenge_id as UUID,
    createdAt: new Date(row.created_at as string),
    reviewDue: new Date(row.review_due as string),
    severity: row.severity as DecisionDebt['severity'],
    status: row.status as DebtStatus,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : null,
    resolutionNotes: row.resolution_notes as string | null,
    escalationCount: row.escalation_count as number,
    tags: JSON.parse(row.tags as string) as string[],
    relatedDebts: JSON.parse(row.related_debts as string) as UUID[],
  };
}

// ====== Session state management ======

export function getSessionAggregate(sessionId: UUID): {
  session: Session | null;
  plan: Plan | null;
  assumptions: Assumption[];
  goals: Goal[];
  constraints: Constraint[];
  criteria: Criterion[];
  challenges: Challenge[];
  decisions: Decision[];
} {
  const session = getSessionById(sessionId);
  if (!session) return { session: null, plan: null, assumptions: [], goals: [], constraints: [], criteria: [], challenges: [], decisions: [] };

  const plan = session.planId ? getPlanById(session.planId) : null;
  const assumptions = session.planId ? getAssumptionsByPlanId(session.planId) : [];
  const goals = session.planId ? getGoalsByPlanId(session.planId) : [];
  const constraints = session.planId ? getConstraintsByPlanId(session.planId) : [];
  const criteria = session.planId ? getCriteriaByPlanId(session.planId) : [];
  const challenges = getChallengesBySessionId(sessionId);
  const decisions = getDecisionsBySessionId(sessionId);

  return { session, plan, assumptions, goals, constraints, criteria, challenges, decisions };
}