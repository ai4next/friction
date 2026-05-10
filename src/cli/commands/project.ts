import { Command } from 'commander';
import chalk from 'chalk';
import { ProjectManager } from '../../core/project-manager.js';

export function registerProjectCommands(program: Command): void {
  const project = program.command('project').description('Manage projects');

  project.command('create')
    .description('Create a new project')
    .argument('<name>', 'Project name')
    .option('-d, --domain <domain>', 'Project domain (e.g. B2B SaaS, healthcare)', 'general')
    .option('--desc <description>', 'Project description')
    .action((name, options) => {
      try {
        const pm = new ProjectManager();
        const p = pm.create(name, options.domain, options.desc);
        console.log(chalk.green(`✓ Project "${p.name}" created (domain: ${p.domain})`));
        console.log(chalk.dim(`  ID: ${p.id}`));
        console.log(chalk.dim(`  Active personas: ${p.activePersonas.length}`));
      } catch (error) {
        console.error(chalk.red(`✗ ${(error as Error).message}`));
      }
    });

  project.command('list')
    .description('List all projects')
    .action(() => {
      const pm = new ProjectManager();
      const projects = pm.list();
      if (projects.length === 0) {
        console.log(chalk.dim('No projects found. Create one with `frict project create <name>`'));
        return;
      }
      console.log(chalk.bold(`\n  Projects (${projects.length}):\n`));
      for (const p of projects) {
        console.log(`  ${chalk.cyan(p.name)}${chalk.dim(` (${p.domain})`)}`);
        console.log(chalk.dim(`    ID: ${p.id}  |  Created: ${p.createdAt.toLocaleDateString()}`));
      }
      console.log();
    });

  project.command('show')
    .description('Show project details')
    .argument('<name>', 'Project name or ID')
    .action((name) => {
      const pm = new ProjectManager();
      const p = pm.get(name);
      if (!p) {
        console.error(chalk.red(`✗ Project "${name}" not found`));
        return;
      }
      console.log(chalk.bold(`\n  ${p.name}\n`));
      console.log(`  Domain:    ${chalk.cyan(p.domain)}`);
      console.log(`  ID:        ${chalk.dim(p.id)}`);
      console.log(`  Created:   ${p.createdAt.toLocaleString()}`);
      console.log(`  Updated:   ${p.updatedAt.toLocaleString()}`);
      console.log(`  Personas:  ${p.activePersonas.length} active`);
      for (const ap of p.activePersonas) {
        console.log(chalk.dim(`    ${ap.enabled ? '✓' : '○'} ${ap.personaId}`));
      }
      console.log();
    });

  project.command('delete')
    .description('Delete a project')
    .argument('<name>', 'Project name or ID')
    .action((name) => {
      const pm = new ProjectManager();
      if (pm.delete(name)) {
        console.log(chalk.green(`✓ Project "${name}" deleted`));
      } else {
        console.error(chalk.red(`✗ Project "${name}" not found`));
      }
    });
}