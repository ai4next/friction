import { Command } from 'commander';
import chalk from 'chalk';
import { ProjectManager } from '../../core/project-manager.js';
import { SessionManager } from '../../core/session-manager.js';
import { DebtSystem } from '../../decision/debt-system.js';
import { getSessionAggregate } from '../../storage/database.js';

export function registerStatusCommand(program: Command): void {
  program.command('status')
    .description('Show current project and session status')
    .option('-p, --project <project>', 'Project name or ID', 'default')
    .action((options) => {
      const pm = new ProjectManager();
      const project = pm.get(options.project);

      if (!project) {
        console.log(chalk.dim(`\n  No project "${options.project}" found.`));
        console.log(chalk.dim('  Create one with `frict project create <name>`\n'));
        return;
      }

      const sm = new SessionManager();
      const activeSession = sm.getActive(project.id);
      const latestSession = sm.getLatest(project.id);

      console.log(chalk.bold(`\n  Friction Status\n`));
      console.log(`  Project: ${chalk.cyan(project.name)} (${project.domain})`);
      console.log(chalk.dim(`  ID: ${project.id}`));

      if (activeSession) {
        const aggregate = getSessionAggregate(activeSession.id);
        const unresolved = aggregate.challenges.filter((c) => c.status === 'pending').length;
        const totalChallenges = aggregate.challenges.length;

        console.log(`\n  Active Session: ${chalk.bold(activeSession.status)}`);
        console.log(chalk.dim(`  ID: ${activeSession.id}`));
        console.log(chalk.dim(`  Created: ${activeSession.createdAt.toLocaleString()}`));

        if (totalChallenges > 0) {
          const pct = totalChallenges > 0 ? Math.round(((totalChallenges - unresolved) / totalChallenges) * 100) : 0;
          console.log(`  Progress: ${chalk.green(`${pct}%`)} (${totalChallenges - unresolved}/${totalChallenges} challenges resolved)`);
        }

        if (unresolved > 0) {
          console.log(chalk.yellow(`\n  ▶ ${unresolved} challenges pending. Run \`frict review\``));
        }
      } else if (latestSession) {
        console.log(chalk.dim(`\n  Last session: ${latestSession.status} (${latestSession.createdAt.toLocaleString()})`));
      } else {
        console.log(chalk.dim('\n  No sessions yet.'));
        console.log(chalk.dim('  Start one with `frict plan start "your brief" --project <name>`'));
      }

      // Debt summary
      const debtSystem = new DebtSystem();
      const openDebt = debtSystem.getOpenDebt(project.id);
      if (openDebt.length > 0) {
        const blockers = openDebt.filter((d) => d.severity === 'blocker').length;
        console.log(chalk.yellow(`\n  ⚠ ${openDebt.length} open debt entries (${blockers} blockers)`));
        console.log(chalk.dim('  Run `frict debt list` for details.'));
      }

      // Personas
      console.log(`\n  Personas: ${chalk.dim(project.activePersonas.filter((p) => p.enabled).length + ' active')}`);
      for (const ap of project.activePersonas) {
        if (ap.enabled) {
          console.log(chalk.dim(`    ✓ ${ap.personaId}`));
        }
      }

      console.log();
    });
}