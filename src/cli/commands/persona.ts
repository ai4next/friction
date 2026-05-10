import { Command } from 'commander';
import chalk from 'chalk';
import { listPersonas, getPersonaByName } from '../../redteam/persona-loader.js';
import { insertPersona } from '../../storage/database.js';
import { v4 as uuid } from 'uuid';
import type { Persona } from '../../types.js';

export function registerPersonaCommands(program: Command): void {
  const persona = program.command('persona').description('Manage personas');

  persona.command('list')
    .description('List all available personas')
    .action(() => {
      const personas = listPersonas();
      if (personas.length === 0) {
        console.log(chalk.dim('\n  No personas found.\n'));
        return;
      }

      console.log(chalk.bold(`\n  Personas (${personas.length}):\n`));
      for (const p of personas) {
        const type = p.isCustom ? chalk.magenta('custom') : chalk.cyan('built-in');
        console.log(`  ${chalk.bold(p.displayName)} ${chalk.dim(`(${p.name})`)} [${type}]`);
        console.log(chalk.dim(`    ${p.description.substring(0, 100)}...`));
        console.log(chalk.dim(`    Temperature: ${p.config.temperature}`));
        console.log();
      }
    });

  persona.command('create')
    .description('Create a custom persona')
    .argument('<name>', 'Persona identifier (e.g. growth_hacker)')
    .requiredOption('--display <display>', 'Display name (e.g. "Growth Hacker")')
    .requiredOption('--description <description>', 'Persona description')
    .requiredOption('--prompt <prompt>', 'System prompt (Layer 2)')
    .option('--temperature <temp>', 'Temperature (0-1)', parseFloat, 0.8)
    .option('--focus <categories>', 'Comma-separated focus categories')
    .action((name, options) => {
      try {
        const existing = getPersonaByName(name);
        if (existing) {
          console.error(chalk.red(`✗ Persona "${name}" already exists`));
          return;
        }

        const focusCategories = options.focus
          ? options.focus.split(',').map((s: string) => s.trim())
          : ['market', 'technical', 'user_behavior'];

        const persona: Persona = {
          id: uuid(),
          name,
          displayName: options.display,
          description: options.description,
          isCustom: true,
          systemPrompt: options.prompt,
          domain: null,
          config: {
            temperature: options.temperature,
            focusCategories,
          },
        };

        insertPersona(persona);
        console.log(chalk.green(`\n  ✓ Persona "${options.display}" created\n`));
      } catch (error) {
        console.error(chalk.red(`✗ ${(error as Error).message}`));
      }
    });

  persona.command('toggle')
    .description('Enable/disable a persona for current project')
    .argument('<name>', 'Persona name')
    .option('--enable', 'Enable the persona')
    .option('--disable', 'Disable the persona')
    .action((name, options) => {
      console.log(chalk.dim(`\n  Use \`frict project config\` to manage project personas.\n`));
    });
}