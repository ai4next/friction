import { Command } from 'commander';
import chalk from 'chalk';
import { ProjectManager } from '../../core/project-manager.js';
import { SessionManager } from '../../core/session-manager.js';
import { PlanManager } from '../../core/plan-manager.js';
import { Extractor, ClarificationError } from '../../spec/extractor.js';
import { Verifier } from '../../spec/verifier.js';
import { RedTeamOrchestrator } from '../../redteam/orchestrator.js';
import { Deduplicator } from '../../redteam/deduplicator.js';
import { seedBuiltinPersonas, getPersonaByName } from '../../redteam/persona-loader.js';
import { getProjectById, getActiveSession, getSessionAggregate } from '../../storage/database.js';
import type { Persona } from '../../types.js';

export function registerPlanCommands(program: Command): void {
  const plan = program.command('plan').description('Start a planning session');

  plan.command('start')
    .description('Start a new planning session with text input')
    .argument('<brief>', 'Your plan description')
    .option('-p, --project <project>', 'Project name or ID')
    .option('--voice', 'Use voice input (not yet implemented)', false)
    .option('--file <path>', 'Read brief from a file')
    .action(async (brief, options) => {
      try {
        // Resolve project
        const projectName = options.project || 'default';
        const pm = new ProjectManager();
        let project = pm.get(projectName);

        if (!project) {
          // Auto-create default project
          project = pm.create(projectName, 'general', 'Auto-created project');
          console.log(chalk.dim(`  Auto-created project "${projectName}"`));
        }

        // Resolve input
        let rawInput = brief;
        if (options.file) {
          const { readFileSync } = await import('fs');
          rawInput = readFileSync(options.file, 'utf-8');
        }

        // Seed built-in personas
        seedBuiltinPersonas();

        // Create session
        const sm = new SessionManager();
        const session = sm.create(project.id, rawInput, options.voice ? 'voice' : 'text');

        console.log(chalk.bold.cyan(`\n  Friction Session Started\n`));
        console.log(chalk.dim(`  Session: ${session.id}`));
        console.log(chalk.dim(`  Project: ${project.name}\n`));

        // Step 1: Specification Layer — Extraction
        console.log(chalk.bold('\n  Step 1: Specification Layer'));
        console.log(chalk.dim('  Parsing your input into a structured plan...'));

        sm.transitionTo(session.id, 'specifying');

        const extractor = new Extractor();
        let structuredPlan;

        try {
          structuredPlan = await extractor.extract(rawInput, project.domain);
        } catch (error) {
          if (error instanceof ClarificationError) {
            console.log(chalk.yellow('\n  ⚠ Need more information:\n'));
            for (const q of error.questions) {
              console.log(chalk.yellow(`  ? ${q}`));
            }
            console.log(chalk.dim('\n  Tip: Provide a more detailed brief, e.g.:'));
            console.log(chalk.dim('  frict plan start "..." --project <name>\n'));
            sm.transitionTo(session.id, 'abandoned');
            return;
          }
          throw error;
        }

        // Step 2: Verification
        console.log(chalk.dim('  Verifying extraction...'));

        const verifier = new Verifier();
        const verification = await verifier.verify(rawInput, structuredPlan);

        if (!verification.isAccurate) {
          console.log(chalk.yellow('\n  ⚠ Verification flags:\n'));
          if (verification.fabricatedAssumptions.length > 0) {
            console.log(chalk.yellow(`  Fabricated: ${verification.fabricatedAssumptions.join(', ')}`));
          }
          if (verification.missedExplicitAssumptions.length > 0) {
            console.log(chalk.yellow(`  Missed: ${verification.missedExplicitAssumptions.join(', ')}`));
          }
        }

        // Check for contradictions
        const hasContradictions = structuredPlan.title?.includes('CONTRADICTION') ||
          JSON.stringify(structuredPlan).includes('CONTRADICTION');

        if (hasContradictions) {
          console.log(chalk.yellow('\n  ⚠ Contradictions detected in your plan.'));
          console.log(chalk.yellow('  Review your goals and constraints for conflicts.\n'));
        }

        // Create plan in storage
        const planManager = new PlanManager();
        const plan = planManager.create(
          session.id,
          structuredPlan.title || 'Untitled Plan',
          rawInput,
          {
            projectPhase: structuredPlan.context?.projectPhase || 'ideation',
            teamSize: structuredPlan.context?.teamSize || 1,
            runwayMonths: structuredPlan.context?.runwayMonths || null,
            priorDecisions: [],
          },
          (structuredPlan.assumptions || []).map((a: { text: string; source: 'explicit' | 'extracted'; sourceQuote?: string | null; category: string; extractionConfidence: number }) => ({
            text: a.text,
            source: a.source,
            sourceQuote: a.sourceQuote || null,
            category: a.category as any,
            extractionConfidence: a.extractionConfidence,
          })),
          (structuredPlan.goals || []).map((g: { text: string; priority: string; successMetric?: string | null; deadline?: string | null }) => ({
            text: g.text,
            priority: g.priority as any,
            successMetric: g.successMetric || null,
            deadline: g.deadline ? new Date(g.deadline) : null,
          })),
          (structuredPlan.constraints || []).map((c: { text: string; type: string; isHard: boolean }) => ({
            text: c.text,
            type: c.type as any,
            isHard: c.isHard,
          })),
          (structuredPlan.acceptanceCriteria || []).map((c: { text: string; measurable: boolean; measurementMethod?: string | null }) => ({
            text: c.text,
            measurable: c.measurable,
            measurementMethod: c.measurementMethod || null,
          })),
          structuredPlan.founderConfidence || {},
        );

        sm.setPlan(session.id, plan.id);
        sm.transitionTo(session.id, 'spec_complete');

        // Print plan summary
        console.log(chalk.green(`\n  ✓ Plan "${plan.title}" created`));
        console.log(chalk.dim(`    ${structuredPlan.assumptions?.length || 0} assumptions, ${structuredPlan.goals?.length || 0} goals, ${structuredPlan.constraints?.length || 0} constraints`));

        // Step 3: Red-Team Layer
        console.log(chalk.bold('\n  Step 2: Red-Team Layer'));
        console.log(chalk.dim('  Dispatching to personas...\n'));

        sm.transitionTo(session.id, 'red_teaming');

        // Get active personas for project
        const activePersonas: Persona[] = [];
        for (const ap of project.activePersonas) {
          if (ap.enabled) {
            const persona = getPersonaByName(ap.personaId);
            if (persona) activePersonas.push(persona);
          }
        }

        if (activePersonas.length === 0) {
          console.log(chalk.yellow('  ⚠ No active personas found. Challenges will not be generated.'));
        } else {
          // Run personas
          const orchestrator = new RedTeamOrchestrator();
          const challenges = await orchestrator.runPersonas(
            {
              planId: plan.id,
              title: plan.title,
              sessionId: session.id,
              projectDomain: project.domain,
            },
            activePersonas,
          );

          console.log(chalk.green(`  ✓ ${challenges.length} challenges generated across ${activePersonas.length} personas\n`));

          for (const persona of activePersonas) {
            const count = challenges.filter((c) => c.personaId === persona.id).length;
            console.log(chalk.dim(`    ${chalk.cyan(persona.displayName)}: ${count} challenges`));
          }

          // Deduplication
          console.log(chalk.bold('\n  Step 3: Deduplication & Conflict Detection'));
          console.log(chalk.dim('  Processing challenges...'));

          const deduplicator = new Deduplicator();
          const { mergedChallenges, conflictPairs } = await deduplicator.deduplicate(challenges);

          if (conflictPairs.length > 0) {
            console.log(chalk.yellow(`\n  ⚠ ${conflictPairs.length} conflicts detected between personas`));
          }

          sm.transitionTo(session.id, 'challenges_ready');

          // Review mode
          console.log(chalk.bold(`\n  ✓ ${mergedChallenges.length} challenges ready for review\n`));
          console.log(chalk.dim('  Run `frict review` to start reviewing challenges.\n'));
        }
      } catch (error) {
        console.error(chalk.red(`\n✗ Error: ${(error as Error).message}`));
        if ((error as Error).stack) {
          console.error(chalk.dim((error as Error).stack));
        }
      }
    });

  plan.command('resume')
    .description('Resume an incomplete session')
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
      try {
        const session = sm.resume(project.id);
        if (!session) {
          console.log(chalk.dim('No incomplete sessions found.'));
          return;
        }
        console.log(chalk.green(`\n  Resumed session ${session.id} (${session.status})\n`));

        const aggregate = getSessionAggregate(session.id);
        if (aggregate.challenges.length > 0) {
          const unresolved = aggregate.challenges.filter((c) => c.status === 'pending');
          console.log(chalk.dim(`  ${unresolved.length} unresolved challenges remaining`));
          console.log(chalk.dim('  Run `frict review` to continue.\n'));
        }
      } catch (error) {
        console.error(chalk.red(`\n  ${(error as Error).message}\n`));
      }
    });
}