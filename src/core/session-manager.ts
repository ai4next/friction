import { v4 as uuid } from 'uuid';
import type { Session, UUID, SessionStatus } from '../types.js';
import { isValidSessionTransition } from '../types.js';
import {
  insertSession, getSessionById, getLatestSession, getActiveSession,
  updateSessionStatus, completeSession, updateSessionChallengeIndex,
  updateSessionPlanId, getOpenDebt,
} from '../storage/database.js';

export class SessionManager {
  create(projectId: UUID, rawInput: string, inputType: 'voice' | 'text' | 'hybrid' = 'text'): Session {
    // Check for unresolved debt from prior sessions
    const unresolvedDebt = getOpenDebt(projectId);
    const debtIds = unresolvedDebt
      .filter((d) => {
        if (d.severity === 'blocker' && d.status !== 'resolved') return true;
        return false;
      })
      .map((d) => d.id);

    const now = new Date();
    const session: Session = {
      id: uuid(),
      projectId,
      status: 'init',
      rawInput,
      rawInputType: inputType,
      createdAt: now,
      completedAt: null,
      planId: null,
      challengeCount: 0,
      unresolvedDebtFromPrior: debtIds,
      currentChallengeIndex: 0,
    };

    insertSession(session);
    return session;
  }

  transitionTo(sessionId: UUID, newStatus: SessionStatus): boolean {
    const session = getSessionById(sessionId);
    if (!session) return false;

    if (!isValidSessionTransition(session.status, newStatus)) {
      throw new Error(
        `Invalid session state transition: ${session.status} → ${newStatus}`
      );
    }

    if (newStatus === 'specifying' && session.status === 'init') {
      updateSessionStatus(sessionId, 'specifying');
      return true;
    }

    updateSessionStatus(sessionId, newStatus);

    if (newStatus === 'completed') {
      completeSession(sessionId);
    }

    return true;
  }

  get(id: UUID): Session | null {
    return getSessionById(id);
  }

  getLatest(projectId: UUID): Session | null {
    return getLatestSession(projectId);
  }

  getActive(projectId: UUID): Session | null {
    return getActiveSession(projectId);
  }

  setPlan(sessionId: UUID, planId: UUID): void {
    updateSessionPlanId(sessionId, planId);
  }

  setChallengeIndex(sessionId: UUID, index: number): void {
    updateSessionChallengeIndex(sessionId, index);
  }

  resume(projectId: UUID): Session | null {
    const active = getActiveSession(projectId);
    if (active) return active;

    // Check for unresolved blocker debt that needs acknowledgment
    const unresolvedDebt = getOpenDebt(projectId);
    const blockers = unresolvedDebt.filter(
      (d) => d.severity === 'blocker' && d.status !== 'resolved'
    );
    if (blockers.length > 0) {
      throw new Error(
        `Cannot start session: ${blockers.length} unresolved blocker debt entries require acknowledgment. Use 'frict debt resolve' to address them.`
      );
    }

    return null;
  }
}