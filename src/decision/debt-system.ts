import { v4 as uuid } from 'uuid';
import type { DecisionDebt, UUID, DebtSeverity, DebtStatus } from '../types.js';
import {
  insertDecisionDebt, getDebtByProjectId, getOpenDebt, getDebtById,
  updateDebtStatus, incrementDebtEscalation,
} from '../storage/database.js';

export class DebtSystem {
  createDebt(
    projectId: UUID,
    sessionId: UUID,
    challengeId: UUID,
    severity: DebtSeverity,
    headline: string,
  ): DecisionDebt {
    const now = new Date();
    // Schedule review: 7 days for major/blocker, 14 days for minor
    const reviewDays = severity === 'minor' ? 14 : 7;
    const reviewDue = new Date(now.getTime() + reviewDays * 24 * 60 * 60 * 1000);

    // Auto-generate tags from headline for pattern matching
    const tags = this.generateTags(headline, severity);

    const debt: DecisionDebt = {
      id: uuid(),
      projectId,
      sessionId,
      challengeId,
      createdAt: now,
      reviewDue,
      severity,
      status: 'open',
      resolvedAt: null,
      resolutionNotes: null,
      escalationCount: 0,
      tags,
      relatedDebts: [],
    };

    insertDecisionDebt(debt);
    return debt;
  }

  getProjectDebt(projectId: UUID): DecisionDebt[] {
    return getDebtByProjectId(projectId);
  }

  getOpenDebt(projectId: UUID): DecisionDebt[] {
    return getOpenDebt(projectId);
  }

  resolveDebt(debtId: UUID, notes?: string): boolean {
    const debt = getDebtById(debtId);
    if (!debt) return false;

    updateDebtStatus(debtId, 'resolved', notes || undefined);
    return true;
  }

  acknowledgeDebt(debtId: UUID): boolean {
    const debt = getDebtById(debtId);
    if (!debt) return false;

    updateDebtStatus(debtId, 'acknowledged');
    return true;
  }

  runEscalationCheck(projectId: UUID): DecisionDebt[] {
    const now = new Date();
    const debts = getDebtByProjectId(projectId);
    const escalated: DecisionDebt[] = [];

    for (const debt of debts) {
      if (debt.status === 'resolved') continue;

      const ageDays = (now.getTime() - new Date(debt.createdAt).getTime()) / (1000 * 60 * 60 * 24);

      if (ageDays > 30 && debt.severity === 'blocker' && debt.status === 'open') {
        updateDebtStatus(debt.id, 'escalated');
        incrementDebtEscalation(debt.id);
        escalated.push({ ...debt, status: 'escalated' });
      }

      if (ageDays > 60) {
        if (debt.status === 'acknowledged') {
          updateDebtStatus(debt.id, 'escalated');
          incrementDebtEscalation(debt.id);
          escalated.push({ ...debt, status: 'escalated' });
        }
      }
    }

    return escalated;
  }

  analyzePatterns(projectId: UUID): Array<{
    pattern: string;
    description: string;
    relatedDebtIds: UUID[];
    suggestion: string;
  }> {
    const debts = getDebtByProjectId(projectId);

    // Group by tag similarity
    const tagGroups = new Map<string, UUID[]>();
    for (const debt of debts) {
      for (const tag of debt.tags) {
        const existing = tagGroups.get(tag) || [];
        existing.push(debt.id);
        tagGroups.set(tag, existing);
      }
    }

    const patterns: Array<{
      pattern: string;
      description: string;
      relatedDebtIds: UUID[];
      suggestion: string;
    }> = [];

    // Find patterns with 3+ occurrences
    for (const [tag, ids] of tagGroups.entries()) {
      if (ids.length >= 3) {
        patterns.push({
          pattern: `${tag}_pattern`,
          description: `You've made ${ids.length} decisions related to "${tag}" that created debt across your sessions.`,
          relatedDebtIds: ids,
          suggestion: `Consider scheduling a dedicated session to address your ${tag} decisions.`,
        });
      }
    }

    return patterns;
  }

  private generateTags(headline: string, severity: DebtSeverity): string[] {
    const tags: string[] = [severity];

    // Simple keyword-based tagging
    const keywordMap: Record<string, string[]> = {
      pricing: ['pricing', 'price', 'revenue', 'monetization', 'pay', 'subscription', 'cost'],
      technical: ['tech', 'architecture', 'database', 'api', 'server', 'deploy', 'scal', 'performance', 'security'],
      user: ['user', 'customer', 'ux', 'onboarding', 'retention', 'engagement', 'signup'],
      timeline: ['deadline', 'launch', 'timeline', 'schedule', 'week', 'month', 'day'],
      market: ['market', 'competitor', 'channel', 'growth', 'acquisition', 'traction'],
    };

    const lower = headline.toLowerCase();
    for (const [tag, keywords] of Object.entries(keywordMap)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        tags.push(tag);
      }
    }

    return tags;
  }
}