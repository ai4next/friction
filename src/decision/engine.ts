import { v4 as uuid } from 'uuid';
import type { Challenge, Decision, DecisionAction, UUID } from '../types.js';
import {
  getSessionById,
  getChallengeById,
  insertDecision,
  updateChallengeStatus,
  updateSessionChallengeIndex,
} from '../storage/database.js';
import { DebtSystem } from './debt-system.js';

export class DecisionEngine {
  private debtSystem: DebtSystem;

  constructor(debtSystem: DebtSystem) {
    this.debtSystem = debtSystem;
  }

  async decide(
    sessionId: UUID,
    challengeId: UUID,
    action: DecisionAction,
    rationale: string,
    modifiedAssumptionText?: string,
  ): Promise<Decision> {
    const session = getSessionById(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const challenge = getChallengeById(challengeId);
    if (!challenge) throw new Error(`Challenge ${challengeId} not found`);

    const now = new Date();
    let debtAccrued = false;
    let debtId: UUID | null = null;

    // Process based on action
    switch (action) {
      case 'approved':
        updateChallengeStatus(challengeId, 'resolved');
        break;

      case 'modified':
        updateChallengeStatus(challengeId, 'resolved');
        break;

      case 'rejected': {
        updateChallengeStatus(challengeId, 'rejected');
        // Check if rejection should accrue debt
        if ((challenge.severity === 'blocker' || challenge.severity === 'major') && rationale.trim().split(/\s+/).length < 5) {
          // Short/dismissive rationale for high-severity challenge → warn
          // For now, auto-accrue debt for blocker rejections with weak rationale
          if (challenge.severity === 'blocker') {
            debtAccrued = true;
          }
        }
        break;
      }

      case 'deferred': {
        updateChallengeStatus(challengeId, 'deferred');
        debtAccrued = true;
        break;
      }

      case 'skipped':
        // Informational only, no status change needed
        break;
    }

    // Create debt if needed
    if (debtAccrued) {
      const debt = this.debtSystem.createDebt(
        session.projectId,
        sessionId,
        challengeId,
        challenge.severity === 'informational' ? 'minor' : challenge.severity,
        challenge.headline,
      );
      debtId = debt.id;
    }

    // Record decision
    const decision: Decision = {
      id: uuid(),
      sessionId,
      challengeId,
      action,
      rationale,
      modifiedAssumptionId: null,
      modifiedAssumptionText: modifiedAssumptionText || null,
      debtAccrued,
      debtId,
      createdAt: now,
    };

    insertDecision(decision);

    return decision;
  }

  getProgress(sessionId: UUID, totalChallenges: number): { current: number; total: number; remaining: number } {
    const session = getSessionById(sessionId);
    if (!session) return { current: 0, total: totalChallenges, remaining: totalChallenges };

    return {
      current: session.currentChallengeIndex,
      total: totalChallenges,
      remaining: totalChallenges - session.currentChallengeIndex,
    };
  }
}