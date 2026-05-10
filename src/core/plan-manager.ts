import { v4 as uuid } from 'uuid';
import type {
  Plan, Assumption, Goal, Constraint, Criterion, UUID,
  AssumptionStatus,
} from '../types.js';
import {
  insertPlan, getPlanById, getPlanBySessionId,
  insertAssumptions, getAssumptionsByPlanId, updateAssumptionStatus,
  insertGoals, getGoalsByPlanId,
  insertConstraints, getConstraintsByPlanId,
  insertCriteria, getCriteriaByPlanId,
} from '../storage/database.js';

export class PlanManager {
  create(
    sessionId: UUID,
    title: string,
    rawInput: string,
    context: Plan['context'],
    assumptions: Omit<Assumption, 'id' | 'planId' | 'status'>[],
    goals: Omit<Goal, 'id' | 'planId'>[],
    constraints: Omit<Constraint, 'id' | 'planId'>[],
    criteria: Omit<Criterion, 'id' | 'planId'>[],
    founderConfidence: Record<string, number> = {},
  ): Plan {
    const now = new Date();
    const planId = uuid();
    const plan: Plan = {
      id: planId,
      sessionId,
      title,
      rawInput,
      founderConfidence,
      context,
      createdAt: now,
      version: 1,
    };

    insertPlan(plan);

    const fullAssumptions: Assumption[] = assumptions.map((a) => ({
      ...a,
      id: uuid(),
      planId,
      status: 'unchallenged' as AssumptionStatus,
    }));
    insertAssumptions(fullAssumptions);

    const fullGoals: Goal[] = goals.map((g) => ({
      ...g,
      id: uuid(),
      planId,
    }));
    insertGoals(fullGoals);

    const fullConstraints: Constraint[] = constraints.map((c) => ({
      ...c,
      id: uuid(),
      planId,
    }));
    insertConstraints(fullConstraints);

    const fullCriteria: Criterion[] = criteria.map((c) => ({
      ...c,
      id: uuid(),
      planId,
    }));
    insertCriteria(fullCriteria);

    return plan;
  }

  get(id: UUID): Plan | null {
    return getPlanById(id);
  }

  getBySession(sessionId: UUID): Plan | null {
    return getPlanBySessionId(sessionId);
  }

  getAssumptions(planId: UUID): Assumption[] {
    return getAssumptionsByPlanId(planId);
  }

  getGoals(planId: UUID): Goal[] {
    return getGoalsByPlanId(planId);
  }

  getConstraints(planId: UUID): Constraint[] {
    return getConstraintsByPlanId(planId);
  }

  getCriteria(planId: UUID): Criterion[] {
    return getCriteriaByPlanId(planId);
  }

  updateAssumptionStatus(assumptionId: UUID, status: AssumptionStatus): void {
    updateAssumptionStatus(assumptionId, status);
  }
}