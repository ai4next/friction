import { Command } from 'commander';
import chalk from 'chalk';
import { ProjectManager } from '../../core/project-manager.js';
import { DebtSystem } from '../../decision/debt-system.js';

export function registerDebtCommands(program: Command): void {
  const debt = program.command('debt').description('Manage decision debt');

  debt.command('list')
    .description('Show all decision debt for a project')
    .option('-p, --project <project>', 'Project name or ID', 'default')
    .action((options) => {
      const pm = new ProjectManager();
      const project = pm.get(options.project);

      if (!project) {
        console.error(chalk.red(`✗ Project "${options.project}" not found`));
        return;
      }

      const debtSystem = new DebtSystem();
      const allDebt = debtSystem.getProjectDebt(project.id);

      if (allDebt.length === 0) {
        console.log(chalk.green('\n  ✓ No decision debt. Clean slate!\n'));
        return;
      }

      const severityColors: Record<string, (s: string) => string> = {
        blocker: chalk.red,
        major: chalk.yellow,
        minor: chalk.cyan,
      };

      console.log(chalk.bold(`\n  Decision Debt (${allDebt.length} total)\n`));

      for (const d of allDebt) {
        const color = severityColors[d.severity] || chalk.white;
        const statusIcon = d.status === 'open' ? '○' : d.status === 'resolved' ? '✓' : d.status === 'escalated' ? '!!' : '◷';
        const ageDays = Math.floor((Date.now() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24));

        console.log(`  ${color(statusIcon)} ${color(d.severity.toUpperCase())} ${chalk.dim(`(${ageDays}d old)`)}`);
        console.log(chalk.dim(`    ID: ${d.id}`));
        console.log(chalk.dim(`    Status: ${d.status}  |  Review due: ${d.reviewDue.toLocaleDateString()}`));
        console.log(`    Tags: ${d.tags.join(', ')}`);
        console.log();
      }

      const open = allDebt.filter((d) => d.status === 'open').length;
      const escalated = allDebt.filter((d) => d.status === 'escalated').length;
      const resolved = allDebt.filter((d) => d.status === 'resolved').length;
      console.log(chalk.dim(`  ${open} open, ${escalated} escalated, ${resolved} resolved\n`));
    });

  debt.command('resolve')
    .description('Resolve a debt entry')
    .argument('<debt-id>', 'Debt entry ID')
    .option('-n, --notes <notes>', 'Resolution notes')
    .action((debtId, options) => {
      const debtSystem = new DebtSystem();
      if (debtSystem.resolveDebt(debtId, options.notes)) {
        console.log(chalk.green(`\n  ✓ Debt entry resolved\n`));
      } else {
        console.error(chalk.red(`✗ Debt entry "${debtId}" not found`));
      }
    });

  debt.command('patterns')
    .description('Show pattern analysis across sessions')
    .option('-p, --project <project>', 'Project name or ID', 'default')
    .action((options) => {
      const pm = new ProjectManager();
      const project = pm.get(options.project);

      if (!project) {
        console.error(chalk.red(`✗ Project "${options.project}" not found`));
        return;
      }

      const debtSystem = new DebtSystem();
      const patterns = debtSystem.analyzePatterns(project.id);

      if (patterns.length === 0) {
        console.log(chalk.dim('\n  No decision patterns detected yet.\n'));
        return;
      }

      console.log(chalk.bold(`\n  Decision Patterns (${patterns.length} found)\n`));
      for (const p of patterns) {
        console.log(`  ${chalk.yellow('◈')} ${p.description}`);
        console.log(chalk.dim(`    Suggestion: ${p.suggestion}`));
        console.log();
      }
    });
}