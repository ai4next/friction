import { Command } from 'commander';
import chalk from 'chalk';
import { ProjectManager } from '../../core/project-manager.js';
import { SessionManager } from '../../core/session-manager.js';
import { DecisionEngine } from '../../decision/engine.js';
import { DebtSystem } from '../../decision/debt-system.js';
import { getSessionAggregate, getUnresolvedChallenges, updateSessionChallengeIndex, getSessionById } from '../../storage/database.js';
import { startInteractiveReview } from '../interactive.js';

export function registerReviewCommands(program: Command): void {
  const review = program.command('review').description('Review challenges');

  review.command('start')
    .description('Start interactive challenge review')
    .option('-p, --project <project>', 'Project name or ID')
    .option('--challenge <id>', 'Review a specific challenge by ID')
    .option('--all', 'Review all challenges for all sessions', false)
    .action(async (options) => {
      try {
        const projectName = options.project || 'default';
        const pm = new ProjectManager();
        const project = pm.get(projectName);

        if (!project) {
          console.error(chalk.red(`✗ Project "${projectName}" not found`));
          return;
        }

        const sm = new SessionManager();
        const session = sm.getActive(project.id);

        if (!session) {
          console.log(chalk.dim('No active session found.'));
          return;
        }

        // Check for unresolved blocker debt before review
        const debtSystem = new DebtSystem();
        const openDebt = debtSystem.getOpenDebt(project.id);
        const blockers = openDebt.filter((d) => d.severity === 'blocker' && d.status !== 'resolved');

        if (blockers.length > 0 && session.status === 'challenges_ready') {
          // Just show a warning, don't block review
          console.log(chalk.yellow(`\n  ⚠ ${blockers.length} unresolved blocker debt entries from prior sessions.\n`));
        }

        const aggregate = getSessionAggregate(session.id);
        const unresolved = aggregate.challenges.filter((c) => c.status === 'pending');

        if (unresolved.length === 0) {
          console.log(chalk.green('\n  ✓ All challenges resolved!\n'));
          return;
        }

        if (options.challenge) {
          const challenge = unresolved.find((c) => c.id === options.challenge);
          if (!challenge) {
            console.error(chalk.red(`✗ Challenge "${options.challenge}" not found or already resolved`));
            return;
          }
          await startInteractiveReview(session.id, [challenge], project.id, debtSystem);
          return;
        }

        console.log(chalk.bold(`\n  Challenge Review (${unresolved.length} remaining)\n`));

        const debtSys = new DebtSystem();
        await startInteractiveReview(session.id, unresolved, project.id, debtSys);
      } catch (error) {
        console.error(chalk.red(`\n✗ Error: ${(error as Error).message}`));
      }
    });

  review.command('list')
    .description('List all challenges for current session')
    .option('-p, --project <project>', 'Project name or ID')
    .action((options) => {
      const projectName = options.project || 'default';
      const pm = new ProjectManager();
      const project = pm.get(projectName);

      if (!project) {
        console.error(chalk.red(`✗ Project "${projectName}" not found`));
        return;
      }

      const sm = new SessionManager();
      const session = sm.getActive(project.id);
      if (!session) {
        console.log(chalk.dim('No active session found.'));
        return;
      }

      const aggregate = getSessionAggregate(session.id);
      const severityColors: Record<string, (s: string) => string> = {
        blocker: chalk.red,
        major: chalk.yellow,
        minor: chalk.cyan,
        informational: chalk.dim,
      };

      console.log(chalk.bold(`\n  Challenges for Session\n`));
      for (const c of aggregate.challenges) {
        const color = severityColors[c.severity] || chalk.white;
        const statusIcon = c.status === 'pending' ? '○' : c.status === 'resolved' ? '✓' : c.status === 'deferred' ? '◷' : '✗';
        console.log(`  ${color(statusIcon)} ${color(c.severity.toUpperCase())} [${c.personaName}] ${c.headline}`);
        console.log(chalk.dim(`    ID: ${c.id}  |  Status: ${c.status}`));
        if (c.counterProposal) {
          console.log(chalk.dim(`    → ${c.counterProposal.substring(0, 80)}...`));
        }
        console.log();
      }

      const resolved = aggregate.challenges.filter((c) => c.status === 'resolved').length;
      const pending = aggregate.challenges.filter((c) => c.status === 'pending').length;
      console.log(chalk.dim(`  ${resolved} resolved, ${pending} pending\n`));
    });
}