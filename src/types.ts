import { z } from 'zod';

// ====== UUID Type Alias ======
export type UUID = string;

// ====== Session State Machine ======
export const SessionStatuses = [
  'init',
  'specifying',
  'spec_complete',
  'red_teaming',
  'challenges_ready',
  'reviewing',
  'completed',
  'abandoned',
] as const;
export type SessionStatus = (typeof SessionStatuses)[number];

export function isValidSessionTransition(from: SessionStatus, to: SessionStatus): boolean {
  const transitions: Record<SessionStatus, SessionStatus[]> = {
    init: ['specifying'],
    specifying: ['spec_complete', 'abandoned'],
    spec_complete: ['red_teaming', 'specifying', 'abandoned'],
    red_teaming: ['challenges_ready', 'abandoned'],
    challenges_ready: ['reviewing', 'abandoned'],
    reviewing: ['completed', 'abandoned', 'reviewing'],
    completed: [],
    abandoned: [],
  };
  return transitions[from]?.includes(to) ?? false;
}

// ====== Debt Status Machine ======
export const DebtStatuses = ['open', 'resolved', 'acknowledged', 'escalated'] as const;
export type DebtStatus = (typeof DebtStatuses)[number];

// ====== Project ======
export interface Project {
  id: UUID;
  name: string;
  description: string | null;
  domain: string;
  createdAt: Date;
  updatedAt: Date;
  activePersonas: PersonaConfig[];
}

export interface PersonaConfig {
  personaId: UUID;
  enabled: boolean;
  config?: Record<string, unknown>;
}

// ====== Session ======
export interface Session {
  id: UUID;
  projectId: UUID;
  status: SessionStatus;
  rawInput: string;
  rawInputType: 'voice' | 'text' | 'hybrid';
  createdAt: Date;
  completedAt: Date | null;
  planId: UUID | null;
  challengeCount: number;
  unresolvedDebtFromPrior: UUID[];
  currentChallengeIndex: number;
}

// ====== Plan ======
export interface Plan {
  id: UUID;
  sessionId: UUID;
  title: string;
  rawInput: string;
  founderConfidence: Record<string, number>;
  context: PlanContext;
  createdAt: Date;
  version: number;
}

export interface PlanContext {
  projectPhase: 'ideation' | 'pre-launch' | 'growth' | 'scale';
  teamSize: number;
  runwayMonths: number | null;
  priorDecisions: UUID[];
}

// ====== Assumption ======
export type AssumptionSource = 'explicit' | 'extracted';
export type AssumptionCategory = 'market' | 'technical' | 'user_behavior' | 'financial' | 'timeline';
export type AssumptionStatus = 'unchallenged' | 'challenged' | 'validated' | 'invalidated' | 'modified';

export interface Assumption {
  id: UUID;
  planId: UUID;
  text: string;
  source: AssumptionSource;
  sourceQuote: string | null;
  category: AssumptionCategory;
  extractionConfidence: number;
  status: AssumptionStatus;
}

// ====== Goal ======
export type GoalPriority = 'must_have' | 'should_have' | 'nice_to_have';

export interface Goal {
  id: UUID;
  planId: UUID;
  text: string;
  priority: GoalPriority;
  successMetric: string | null;
  deadline: Date | null;
}

// ====== Constraint ======
export type ConstraintType = 'time' | 'budget' | 'technical' | 'regulatory' | 'resource' | 'other';

export interface Constraint {
  id: UUID;
  planId: UUID;
  text: string;
  type: ConstraintType;
  isHard: boolean;
}

// ====== Criterion ======
export interface Criterion {
  id: UUID;
  planId: UUID;
  text: string;
  measurable: boolean;
  measurementMethod: string | null;
}

// ====== Persona ======
export interface Persona {
  id: UUID;
  name: string;
  displayName: string;
  description: string;
  isCustom: boolean;
  systemPrompt: string;
  domain: string | null;
  config: {
    temperature: number;
    focusCategories: string[];
  };
}

// ====== Challenge ======
export type ChallengeSeverity = 'blocker' | 'major' | 'minor' | 'informational';
export type ChallengeCategory = 'assumption_inversion' | 'gap_identified' | 'risk_flag' | 'alternative_approach';
export type ChallengeStatus = 'pending' | 'resolved' | 'deferred' | 'rejected';

export interface Challenge {
  id: UUID;
  sessionId: UUID;
  personaId: UUID;
  personaName: string;
  targets: UUID[];
  severity: ChallengeSeverity;
  category: ChallengeCategory;
  headline: string;
  body: string;
  evidence: string | null;
  counterProposal: string | null;
  personaConfidence: number;
  relatedPastDecisions: UUID[];
  conflictWith: UUID[];
  status: ChallengeStatus;
  targetType?: 'assumption' | 'goal' | 'constraint';
  targetText?: string;
}

// ====== Decision ======
export type DecisionAction = 'approved' | 'modified' | 'rejected' | 'deferred' | 'skipped';

export interface Decision {
  id: UUID;
  sessionId: UUID;
  challengeId: UUID;
  action: DecisionAction;
  rationale: string;
  modifiedAssumptionId: UUID | null;
  modifiedAssumptionText: string | null;
  debtAccrued: boolean;
  debtId: UUID | null;
  createdAt: Date;
}

// ====== DecisionDebt ======
export type DebtSeverity = 'blocker' | 'major' | 'minor';

export interface DecisionDebt {
  id: UUID;
  projectId: UUID;
  sessionId: UUID;
  challengeId: UUID;
  createdAt: Date;
  reviewDue: Date;
  severity: DebtSeverity;
  status: DebtStatus;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  escalationCount: number;
  tags: string[];
  relatedDebts: UUID[];
}

// ====== Export ======
export type ExportFormat = 'json' | 'markdown' | 'claude-code' | 'cursor';
export type ExportTarget = 'claude-code' | 'cursor' | 'bolt' | 'replit' | 'generic';

export interface ExportedPlan {
  plan: {
    title: string;
    goals: Goal[];
    constraints: Constraint[];
  };
  settledDecisions: SettledDecision[];
  openQuestions: OpenQuestion[];
  context: {
    projectPhase: string;
    teamSize: number;
  };
}

export interface SettledDecision {
  assumption: string;
  challenge: string;
  decision: DecisionAction;
  resolution: string;
}

export interface OpenQuestion {
  assumption: string;
  challenge: string;
  status: string;
  reviewDue: string | null;
}

// ====== LLM Provider Config ======
export type LLMProvider = 'openai' | 'anthropic' | 'openrouter';

export interface ProviderStageConfig {
  stage: string;
  provider: LLMProvider;
  apiKey: string;
  model: string;
  temperature?: number;
  baseURL?: string;
}

// ====== App Config ======
export interface AppConfig {
  llm: {
    defaultProvider: LLMProvider;
    defaultModel: string;
    apiKey: string;
    providers: ProviderStageConfig[];
  };
  storage: {
    dbPath: string;
  };
  notifications?: {
    slack?: { webhook: string };
    weeklyDigest?: { enabled: boolean; day: string; time: string };
    reviewReminder?: { leadTime: string };
  };
}

// ====== Zod Schemas for LLM Structured Output ======

export const AssumptionSchema = z.object({
  text: z.string().describe('The assumption statement'),
  source: z.enum(['explicit', 'extracted']).describe('Whether the founder stated this explicitly or it was inferred'),
  sourceQuote: z.string().nullable().optional().describe('Exact quote from raw input if explicit'),
  category: z.enum(['market', 'technical', 'user_behavior', 'financial', 'timeline']).describe('Category of assumption'),
  extractionConfidence: z.number().min(1).max(10).describe('Confidence in this extraction (1-10)'),
});

export const GoalSchema = z.object({
  text: z.string().describe('The goal statement'),
  priority: z.enum(['must_have', 'should_have', 'nice_to_have']).describe('Priority of the goal'),
  successMetric: z.string().nullable().optional().describe('How success is measured'),
  deadline: z.string().nullable().optional().describe('Deadline if any'),
});

export const ConstraintSchema = z.object({
  text: z.string().describe('The constraint statement'),
  type: z.enum(['time', 'budget', 'technical', 'regulatory', 'resource', 'other']).describe('Type of constraint'),
  isHard: z.boolean().describe('Whether this is a hard constraint that cannot be violated'),
});

export const CriterionSchema = z.object({
  text: z.string().describe('The acceptance criterion'),
  measurable: z.boolean().describe('Whether this criterion is measurable'),
  measurementMethod: z.string().nullable().optional().describe('How to measure this criterion'),
});

export const StructuredPlanSchema = z.object({
  title: z.string().describe('A concise title for this plan'),
  context: z.object({
    projectPhase: z.enum(['ideation', 'pre-launch', 'growth', 'scale']).describe('Current project phase'),
    teamSize: z.number().describe('Current team size'),
    runwayMonths: z.number().nullable().optional().describe('Months of runway remaining'),
  }),
  assumptions: z.array(AssumptionSchema).describe('All assumptions (explicit and extracted)'),
  goals: z.array(GoalSchema).describe('Goals for this plan'),
  constraints: z.array(ConstraintSchema).describe('Constraints for this plan'),
  acceptanceCriteria: z.array(CriterionSchema).describe('Acceptance criteria'),
  founderConfidence: z.record(z.string(), z.number()).describe('Goal ID to confidence score mapping'),
});

export const ChallengeOutputSchema = z.object({
  challenges: z.array(z.object({
    targets: z.array(z.string()).describe('IDs of targeted assumptions/goals/constraints'),
    severity: z.enum(['blocker', 'major', 'minor', 'informational']).describe('Severity of the challenge'),
    category: z.enum(['assumption_inversion', 'gap_identified', 'risk_flag', 'alternative_approach']).describe('Category'),
    headline: z.string().describe('One-line summary of the challenge'),
    body: z.string().describe('Detailed argument (1-3 paragraphs)'),
    evidence: z.string().nullable().optional().describe('Data point, citation, or logical chain'),
    counterProposal: z.string().nullable().optional().describe('Instead of X, consider Y'),
    personaConfidence: z.number().min(1).max(10).describe('Confidence in this challenge'),
  })).describe('List of challenges generated by this persona'),
});

export const DedupInputSchema = z.object({
  groups: z.array(z.object({
    challengeIds: z.array(z.string()).describe('IDs of challenges that are semantically similar'),
    mergedHeadline: z.string().describe('A merged headline representing the group'),
    mergedBody: z.string().describe('A merged body synthesizing the challenges'),
  })).describe('Groups of semantically similar challenges'),
  conflicts: z.array(z.object({
    challengeIdA: z.string().describe('First challenge ID in the conflict pair'),
    challengeIdB: z.string().describe('Second challenge ID in the conflict pair'),
    description: z.string().describe('Description of the contradiction'),
  })).describe('Detected direct contradictions between challenges'),
});

export type StructuredPlan = z.infer<typeof StructuredPlanSchema>;
export type ChallengeOutput = z.infer<typeof ChallengeOutputSchema>;
export type DedupOutput = z.infer<typeof DedupInputSchema>;