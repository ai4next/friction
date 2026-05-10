import { Command } from 'commander';
import chalk from 'chalk';
import { registerProjectCommands } from './commands/project.js';
import { registerPlanCommands } from './commands/plan.js';
import { registerReviewCommands } from './commands/review.js';
import { registerPersonaCommands } from './commands/persona.js';
import { registerDebtCommands } from './commands/debt.js';
import { registerExportCommands } from './commands/export.js';
import { registerConfigCommand } from './commands/config.js';
import { registerStatusCommand } from './commands/status.js';
import { seedBuiltinPersonas } from '../redteam/persona-loader.js';

const program = new Command();

program
  .name('frict')
  .description('Friction — The Solo Founder\'s Co-Founder AI')
  .version('0.1.0');

// Seed built-in personas on first run
try {
  seedBuiltinPersonas();
} catch (e) {
  // Silently handle — personas may already be seeded
}

registerProjectCommands(program);
registerPlanCommands(program);
registerReviewCommands(program);
registerPersonaCommands(program);
registerDebtCommands(program);
registerExportCommands(program);
registerStatusCommand(program);
registerConfigCommand(program);

program.parse(process.argv);

// Show help if no command is given
if (!process.argv.slice(2).length) {
  console.log(chalk.bold.cyan('\n  Friction — The Solo Founder\'s Co-Founder AI\n'));
  program.outputHelp();
  console.log(chalk.dim('\n  Run `frict <command> --help` for details on a specific command.\n'));
}