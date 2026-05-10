import { v4 as uuid } from 'uuid';
import { BasePersona } from './base-persona.js';
import type { Challenge, UUID, Persona, Assumption, Goal, Constraint, Criterion } from '../types.js';
import {
  getPersonaByName,
  insertChallenges,
  getAssumptionsByPlanId,
  getGoalsByPlanId,
  getConstraintsByPlanId,
  getCriteriaByPlanId,
  getChallengesBySessionId,
} from '../storage/database.js';

export interface PlanSummary {
  planId: UUID;
  title: string;
  sessionId: UUID;
  projectDomain?: string;
}

export class RedTeamOrchestrator {
  async runPersonas(planSummary: PlanSummary, projectPersonas: Persona[]): Promise<Challenge[]> {
    const assumptions = getAssumptionsByPlanId(planSummary.planId);
    const goals = getGoalsByPlanId(planSummary.planId);
    const constraints = getConstraintsByPlanId(planSummary.planId);
    const criteria = getCriteriaByPlanId(planSummary.planId);

    const fullAssumptions = assumptions.length > 0
      ? assumptions.map((a) => `[${a.source}] (${a.category}, confidence: ${a.extractionConfidence}/10) "${a.text}"${a.sourceQuote ? `\n  Quote: "${a.sourceQuote}"` : ''}`).join('\n\n')
      : '(none extracted)';

    const fullGoals = goals.length > 0
      ? goals.map((g) => `[${g.priority}] ${g.text}${g.successMetric ? ` — Success: ${g.successMetric}` : ''}${g.deadline ? ` — Deadline: ${g.deadline}` : ''}`).join('\n')
      : '(none extracted)';

    const fullConstraints = constraints.length > 0
      ? constraints.map((c) => `[${c.type}${c.isHard ? ' HARD' : ''}] ${c.text}`).join('\n')
      : '(none extracted)';

    const fullCriteria = criteria.length > 0
      ? criteria.map((c) => `${c.text}${c.measurable ? ` (measurable: ${c.measurementMethod || 'yes'})` : ' (not measurable)'}`).join('\n')
      : '(none extracted)';

    const additionalContext = planSummary.projectDomain
      ? `Project domain: ${planSummary.projectDomain}`
      : '';

    // Run all personas in parallel
    const personaPromises = projectPersonas.map(async (persona) => {
      try {
        const basePersona = new BasePersona(persona, planSummary.projectDomain);
        const challengeOutput = await basePersona.generateChallenges(
          planSummary.title,
          fullGoals,
          fullAssumptions,
          fullConstraints,
          fullCriteria,
          additionalContext,
        );

        return challengeOutput.challenges.map((c) => {
          const challenge: Challenge = {
            id: uuid(),
            sessionId: planSummary.sessionId,
            personaId: persona.id,
            personaName: persona.displayName,
            targets: c.targets as UUID[],
            severity: c.severity,
            category: c.category,
            headline: c.headline,
            body: c.body,
            evidence: c.evidence || null,
            counterProposal: c.counterProposal || null,
            personaConfidence: c.personaConfidence,
            relatedPastDecisions: [],
            conflictWith: [],
            status: 'pending',
          };
          return challenge;
        });
      } catch (error) {
        console.error(`Persona "${persona.displayName}" failed:`, error);
        return [] as Challenge[];
      }
    });

    const results = await Promise.all(personaPromises);
    const allChallenges = results.flat();

    // Store challenges
    insertChallenges(allChallenges);

    return allChallenges;
  }
}