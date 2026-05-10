import type { Plan, Assumption, Goal, Constraint, Criterion, Challenge, Decision, UUID, ExportTarget, ExportFormat } from '../types.js';
import { getAssumptionsByPlanId, getGoalsByPlanId, getConstraintsByPlanId, getCriteriaByPlanId, getChallengesBySessionId, getDecisionsBySessionId } from '../storage/database.js';
import { FRICTION_HOME } from '../storage/paths.js';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

export class Exporter {
  exportToJson(plan: Plan, sessionId: UUID): string {
    const assumptions = getAssumptionsByPlanId(plan.id);
    const goals = getGoalsByPlanId(plan.id);
    const constraints = getConstraintsByPlanId(plan.id);
    const criteria = getCriteriaByPlanId(plan.id);
    const challenges = getChallengesBySessionId(sessionId);
    const decisions = getDecisionsBySessionId(sessionId);

    const settledDecisions = decisions
      .filter((d) => d.action === 'approved' || d.action === 'modified')
      .map((d) => {
        const challenge = challenges.find((c) => c.id === d.challengeId);
        return {
          assumption: challenge?.targetText || challenge?.headline || 'Unknown',
          challenge: challenge?.body || '',
          decision: d.action,
          resolution: d.rationale,
        };
      });

    const openQuestions = decisions
      .filter((d) => d.action === 'deferred')
      .map((d) => {
        const challenge = challenges.find((c) => c.id === d.challengeId);
        const debt = null; // Could look up debt
        return {
          assumption: challenge?.targetText || challenge?.headline || 'Unknown',
          challenge: challenge?.body || '',
          status: 'deferred',
          reviewDue: null,
        };
      });

    // Also include unresolved challenges as open questions
    const unresolved = challenges.filter((c) => c.status === 'pending');
    for (const c of unresolved) {
      openQuestions.push({
        assumption: c.targetText || c.headline,
        challenge: c.body,
        status: 'unresolved',
        reviewDue: null,
      });
    }

    const exported = {
      plan: {
        title: plan.title,
        goals: goals.map((g) => ({ text: g.text, priority: g.priority, successMetric: g.successMetric })),
        constraints: constraints.map((c) => ({ text: c.text, type: c.type, isHard: c.isHard })),
      },
      settledDecisions,
      openQuestions,
      context: {
        projectPhase: plan.context.projectPhase,
        teamSize: plan.context.teamSize,
      },
    };

    return JSON.stringify(exported, null, 2);
  }

  exportToMarkdown(plan: Plan, sessionId: UUID): string {
    const json = JSON.parse(this.exportToJson(plan, sessionId));

    let md = `# Plan: ${json.plan.title}\n\n`;

    md += `## Goals\n\n`;
    for (const goal of json.plan.goals) {
      md += `- **[${goal.priority}]** ${goal.text}`;
      if (goal.successMetric) md += ` — ${goal.successMetric}`;
      md += '\n';
    }

    md += `\n## Constraints\n\n`;
    for (const constraint of json.plan.constraints) {
      md += `- [${constraint.type}]${constraint.isHard ? ' (hard)' : ''} ${constraint.text}\n`;
    }

    md += `\n## Settled Decisions\n\n`;
    if (json.settledDecisions.length === 0) {
      md += '_None_\n';
    } else {
      for (const sd of json.settledDecisions) {
        md += `- **${sd.assumption}** → ${sd.decision}: ${sd.resolution}\n`;
      }
    }

    md += `\n## Open Questions\n\n`;
    if (json.openQuestions.length === 0) {
      md += '_None_\n';
    } else {
      for (const oq of json.openQuestions) {
        md += `- **${oq.assumption}** (${oq.status}): ${oq.challenge}\n`;
      }
    }

    md += `\n## Context\n\n`;
    md += `- Phase: ${json.context.projectPhase}\n`;
    md += `- Team size: ${json.context.teamSize}\n`;

    return md;
  }

  exportForClaudeCode(plan: Plan, sessionId: UUID): string {
    const json = JSON.parse(this.exportToJson(plan, sessionId));

    let doc = `# Friction Validated Plan: ${json.plan.title}\n\n`;
    doc += `> This plan has passed through adversarial review. The following assumptions have been validated and are considered settled for this implementation.\n\n`;

    doc += `## DO NOT RE-LITIGATE\n\n`;
    doc += `The following decisions have been settled through adversarial review:\n\n`;
    for (const sd of json.settledDecisions) {
      doc += `- ✅ **${sd.assumption}**: ${sd.resolution}\n`;
    }

    if (json.openQuestions.length > 0) {
      doc += `\n## Open Questions to Watch\n\n`;
      doc += `These questions are unresolved and may arise during implementation:\n\n`;
      for (const oq of json.openQuestions) {
        doc += `- ❓ **${oq.assumption}** (${oq.status}): ${oq.challenge}\n`;
      }
    }

    doc += `\n## Goals\n\n`;
    for (const goal of json.plan.goals) {
      doc += `- [${goal.priority}] ${goal.text}\n`;
    }

    doc += `\n## Constraints\n\n`;
    for (const constraint of json.plan.constraints) {
      doc += `- ${constraint.isHard ? '🔒' : '📋'} ${constraint.text}\n`;
    }

    return doc;
  }

  exportForCursor(plan: Plan, sessionId: UUID): string {
    const md = this.exportForClaudeCode(plan, sessionId);
    return md;
  }

  saveToFile(content: string, format: ExportFormat, filename?: string): string {
    const exportDir = join(FRICTION_HOME, 'exports');
    if (!existsSync(exportDir)) {
      mkdirSync(exportDir, { recursive: true });
    }

    const extMap: Record<ExportFormat, string> = {
      json: '.json',
      markdown: '.md',
      'claude-code': '.md',
      cursor: '.cursorrules',
    };

    const ext = extMap[format] || '.json';
    const name = filename || `friction-plan-${Date.now()}`;
    const filePath = join(exportDir, `${name}${ext}`);

    writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  export(plan: Plan, sessionId: UUID, target: ExportTarget = 'generic', format?: ExportFormat): { content: string; path: string } {
    const resolvedFormat: ExportFormat = format || (target === 'claude-code' ? 'claude-code' : target === 'cursor' ? 'cursor' : 'json');

    let content: string;
    switch (resolvedFormat) {
      case 'claude-code':
        content = this.exportForClaudeCode(plan, sessionId);
        break;
      case 'cursor':
        content = this.exportForCursor(plan, sessionId);
        break;
      case 'markdown':
        content = this.exportToMarkdown(plan, sessionId);
        break;
      case 'json':
      default:
        content = this.exportToJson(plan, sessionId);
        break;
    }

    const filename = plan.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const path = this.saveToFile(content, resolvedFormat, filename);

    return { content, path };
  }
}