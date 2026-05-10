import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig, setConfig, clearConfigCache } from '../../storage/config.js';

export function registerConfigCommand(program: Command): void {
  const config = program.command('config').description('Manage configuration');

  config.command('show')
    .description('Show current configuration')
    .action(() => {
      const cfg = getConfig();
      console.log(chalk.bold('\n  Friction Configuration\n'));
      console.log(chalk.dim('  LLM:\n'));
      console.log(chalk.dim(`    Default Provider: ${cfg.llm.defaultProvider}`));
      console.log(chalk.dim(`    Default Model: ${cfg.llm.defaultModel}`));
      console.log(chalk.dim(`    API Key: ${cfg.llm.apiKey ? '****' + cfg.llm.apiKey.slice(-4) : '(not set)'}`));
      console.log(chalk.dim(`    API Key (from env): ${process.env.ANTHROPIC_API_KEY ? '****' + process.env.ANTHROPIC_API_KEY.slice(-4) : '(not set)'}\n`));
      console.log(chalk.dim('  Stage Providers:\n'));
      for (const p of cfg.llm.providers) {
        console.log(chalk.dim(`    ${p.stage}: ${p.provider}/${p.model} (temp: ${p.temperature})`));
      }
      console.log(chalk.dim('\n  Tip: Set ANTHROPIC_API_KEY or OPENAI_API_KEY env var,'));
      console.log(chalk.dim('  or run `frict config set api-key <key>`\n'));
    });

  config.command('set')
    .description('Set a configuration value')
    .argument('<key>', 'Config key (e.g. api-key)')
    .argument('<value>', 'Config value')
    .action((key, value) => {
      const cfg = getConfig();
      switch (key) {
        case 'api-key':
          cfg.llm.apiKey = value;
          break;
        case 'default-model':
          cfg.llm.defaultModel = value;
          break;
        case 'default-provider':
          cfg.llm.defaultProvider = value as any;
          break;
        default:
          console.error(chalk.red(`✗ Unknown config key: ${key}`));
          console.log(chalk.dim('  Valid keys: api-key, default-model, default-provider'));
          return;
      }
      clearConfigCache();
      setConfig(cfg);
      console.log(chalk.green(`\n  ✓ ${key} updated\n`));
    });
}