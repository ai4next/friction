import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { getLLM } from '../llm/client.js';
import type { Challenge, ChallengeOutput, UUID, Persona } from '../types.js';
import { ChallengeOutputSchema } from '../types.js';
import {
  DEVILS_ADVOCATE_PROMPT, DOMAIN_EXPERT_PROMPT,
  CUSTOMER_SKEPTIC_PROMPT, TECH_DEBT_GUARDIAN_PROMPT,
} from './prompts.js';

const CHALLENGE_TEMPLATE = `Generate challenges for the following plan. Review each assumption, goal, and constraint carefully.

PLAN TITLE: {planTitle}

GOALS:
{goals}

ASSUMPTIONS:
{assumptions}

CONSTRAINTS:
{constraints}

ACCEPTANCE CRITERIA:
{criteria}

{additionalContext}

Generate 2-4 specific, well-reasoned challenges. Focus on quality over quantity.`;

export class BasePersona {
  private persona: Persona;
  private domain?: string;

  constructor(persona: Persona, domain?: string) {
    this.persona = persona;
    this.domain = domain;
  }

  getSystemPrompt(): string {
    const promptMap: Record<string, string> = {
      devils_advocate: DEVILS_ADVOCATE_PROMPT,
      domain_expert: DOMAIN_EXPERT_PROMPT,
      customer_skeptic: CUSTOMER_SKEPTIC_PROMPT,
      tech_debt_guardian: TECH_DEBT_GUARDIAN_PROMPT,
    };

    let prompt = promptMap[this.persona.name] || this.persona.systemPrompt || DEVILS_ADVOCATE_PROMPT;

    if (this.persona.name === 'domain_expert' && this.domain) {
      prompt = prompt.replace(/\{domain\}/g, this.domain);
    }

    return prompt;
  }

  async generateChallenges(
    planTitle: string,
    goals: string,
    assumptions: string,
    constraints: string,
    criteria: string,
    additionalContext: string = '',
  ): Promise<ChallengeOutput> {
    const llm = getLLM('persona');

    // We need to create a custom chain that includes the system prompt
    // Use withStructuredOutput for Zod schema
    const chain = PromptTemplate.fromTemplate(CHALLENGE_TEMPLATE)
      .pipe(llm.withStructuredOutput(ChallengeOutputSchema));

    const result = await chain.invoke({
      planTitle,
      goals,
      assumptions,
      constraints,
      criteria,
      additionalContext: additionalContext || 'None',
    }) as ChallengeOutput;

    return result;
  }
}

export { DEVILS_ADVOCATE_PROMPT, DOMAIN_EXPERT_PROMPT, CUSTOMER_SKEPTIC_PROMPT, TECH_DEBT_GUARDIAN_PROMPT };