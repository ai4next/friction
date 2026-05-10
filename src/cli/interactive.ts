import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';
import type { Challenge, UUID } from '../types.js';
import { DecisionEngine } from '../decision/engine.js';
import { DebtSystem } from '../decision/debt-system.js';
import { updateSessionChallengeIndex, getSessionById } from '../storage/database.js';

const severityColors: Record<string, (s: string) => string> = {
  blocker: chalk.bgRed.white.bold,
  major: chalk.yellow.bold,
  minor: chalk.cyan,
  informational: chalk.dim,
};

const severityLabels: Record<string, string> = {
  blocker: 'BLOCKER',
  major: 'MAJOR',
  minor: 'MINOR',
  informational: 'INFO',
};

export async function startInteractiveReview(
  sessionId: UUID,
  challenges: Challenge[],
  projectId: UUID,
  debtSystem: DebtSystem,
): Promise<void> {
  let currentIndex = 0;
  const total = challenges.length;

  for (let i = currentIndex; i < total; i++) {
    const challenge = challenges[i]!;
    const remaining = total - i;

    printChallenge(challenge, i + 1, total);

    const action = await select({
      message: 'Your decision:',
      choices: [
        { name: 'Approve', value: 'approved', description: 'Accept challenge as valid' },
        { name: 'Modify', value: 'modified', description: 'Accept spirit but adjust assumption' },
        { name: 'Reject', value: 'rejected', description: 'Disagree with rationale' },
        { name: 'Defer', value: 'deferred', description: 'Needs more info, revisit later' },
        { name: 'Skip', value: 'skipped', description: 'Informational, no action' },
        { name: 'Quit', value: 'quit', description: 'Exit review, save progress' },
      ],
    });

    if (action === 'quit') {
      updateSessionChallengeIndex(sessionId, i);
      console.log(chalk.dim(`\n  Progress saved. ${remaining} challenges remaining.\n`));
      return;
    }

    let rationale = '';
    if (action === 'rejected') {
      rationale = await input({
        message: 'Rationale for rejection (required, 1-2 sentences):',
        validate: (value: string) => value.trim().length >= 10 || 'Please provide a more detailed rationale (≥10 characters)',
      });
    } else if (action === 'modified') {
      rationale = await input({
        message: 'Describe the modification:',
        validate: (value: string) => value.trim().length > 0 || 'Please describe your modification',
      });
    } else {
      rationale = await input({
        message: 'Rationale (optional, press Enter to skip):',
      });
      if (!rationale.trim()) {
        rationale = action === 'approved' ? 'Challenge accepted.' : 'Noted.';
      }
    }

    const engine = new DecisionEngine(debtSystem);
    const decision = await engine.decide(sessionId, challenge.id, action as any, rationale);

    if (decision.debtAccrued && decision.debtId) {
      console.log(chalk.yellow(`\n  ⚠ Decision debt created (ID: ${decision.debtId})`));
      if (action === 'deferred') {
        const debt = debtSystem.getProjectDebt(projectId).find((d) => d.id === decision.debtId);
        if (debt) {
          console.log(chalk.dim(`  Review due: ${debt.reviewDue.toLocaleDateString()}`));
        }
      }
    }

    const progress = `${i + 1}/${total}`;
    console.log(chalk.green(`\n  ✓ ${action} — ${progress} complete\n`));
    console.log(chalk.dim('  ' + '─'.repeat(40) + '\n'));
  }

  // Check if all resolved
  console.log(chalk.green.bold('\n  ✓ All challenges reviewed!\n'));

  // Run escalation check
  const escalated = debtSystem.runEscalationCheck(projectId);
  if (escalated.length > 0) {
    console.log(chalk.yellow(`  ⚠ ${escalated.length} debt entries escalated due to aging.\n`));
    console.log(chalk.dim('  Run `frict debt list` to review.\n'));
  }

  // Check for patterns
  const patterns = debtSystem.analyzePatterns(projectId);
  if (patterns.length > 0) {
    console.log(chalk.bold('  Decision Patterns Detected:\n'));
    for (const p of patterns) {
      console.log(chalk.yellow(`  ◈ ${p.description}`));
      console.log(chalk.dim(`    ${p.suggestion}\n`));
    }
  }
}

function printChallenge(challenge: Challenge, index: number, total: number): void {
  const severityColor = severityColors[challenge.severity] || chalk.white;
  const severityLabel = severityLabels[challenge.severity] || challenge.severity;

  console.log(chalk.bold(`\n  ═══════════════════════════════════════════`));
  console.log(chalk.bold(`  CHALLENGE ${index}/${total}`));
  console.log(chalk.bold(`  ═══════════════════════════════════════════\n`));

  console.log(`  ${severityColor(` ${severityLabel} `)} ${chalk.cyan(challenge.personaName)}`);
  console.log();

  if (challenge.targetText) {
    console.log(chalk.dim(`  Targets: "${challenge.targetText}"\n`));
  }

  console.log(`  ${chalk.bold(challenge.headline)}\n`);
  console.log(`  ${challenge.body}\n`);

  if (challenge.evidence) {
    console.log(chalk.dim(`  Evidence: ${challenge.evidence}\n`));
  }

  if (challenge.counterProposal) {
    console.log(chalk.cyan(`  → ${challenge.counterProposal}\n`));
  }

  if (challenge.conflictWith.length > 0) {
    console.log(chalk.yellow(`  ⚠ This challenge conflicts with another persona's findings.\n`));
  }

  console.log(chalk.dim(`  ${'─'.repeat(40)}`));
}