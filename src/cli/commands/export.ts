import { Command } from 'commander';
import chalk from 'chalk';
import { ProjectManager } from '../../core/project-manager.js';
import { SessionManager } from '../../core/session-manager.js';
import { PlanManager } from '../../core/plan-manager.js';
import { Exporter } from '../../export/exporter.js';
import { getSessionAggregate, getSessionById } from '../../storage/database.js';

export function registerExportCommands(program: Command): void {
  const exp = program.command('export').description('Export validated plan');

  exp.command('plan')
    .description('Export a validated plan')
    .option('-p, --project <project>', 'Project name or ID', 'default')
    .option('--session <id>', 'Session ID (uses latest if not specified)')
    .option('-a, --agent <agent>', 'Target execution agent', 'generic')
    .option('-f, --format <format>', 'Export format (json, markdown, claude-code, cursor)', 'json')
    .action((options) => {
      try {
        const pm = new ProjectManager();
        const project = pm.get(options.project);

        if (!project) {
          console.error(chalk.red(`✗ Project "${options.project}" not found`));
          return;
        }

        const sm = new SessionManager();
        const session = options.session
          ? sm.get(options.session)
          : sm.getLatest(project.id);

        if (!session) {
          console.error(chalk.red('✗ No session found'));
          return;
        }

        const planManager = new PlanManager();
        const plan = session.planId ? planManager.get(session.planId) : null;

        if (!plan) {
          console.error(chalk.red('✗ No plan found for this session'));
          return;
        }

        const exporter = new Exporter();
        const { content, path } = exporter.export(
          plan,
          session.id,
          options.agent as any,
          options.format as any,
        );

        console.log(chalk.green(`\n  ✓ Plan exported to ${path}\n`));
        console.log(chalk.dim('  Preview:\n'));
        console.log(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
        console.log();
      } catch (error) {
        console.error(chalk.red(`✗ Error: ${(error as Error).message}`));
      }
    });
}