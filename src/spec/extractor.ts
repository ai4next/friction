import { PromptTemplate } from '@langchain/core/prompts';
import { getLLM } from '../llm/client.js';
import { StructuredPlanSchema } from '../types.js';
import type { StructuredPlan } from '../types.js';
import { z } from 'zod';

const EXTRACTION_TEMPLATE = `You are the Specification Layer for Friction, an AI that converts raw founder input into a structured plan.

Your job is to parse the founder's raw input and extract:
1. **Title**: A concise title for this plan
2. **Context**: Project phase, team size, runway months
3. **Assumptions**: Both explicit (stated directly) and extracted (implied but never stated). Extracted assumptions are the highest-value insights — make them explicit.
4. **Goals**: What the founder wants to achieve, with priorities
5. **Constraints**: Time, budget, technical, regulatory, or resource limitations
6. **Acceptance Criteria**: How success will be measured
7. **Founder Confidence**: Self-assessed confidence per goal (1-10)

Be thorough. If the input is very short (fewer than 20 words), do NOT hallucinate assumptions — instead, set the title and return minimal extraction. If you detect contradictions in the input, flag them by including the word "CONTRADICTION" in your output.

RAW INPUT:
{rawInput}

ADDITIONAL CONTEXT:
{additionalContext}

{language_instruction}`;

const CLARIFICATION_TEMPLATE = `The founder provided a very brief input. Generate 2-3 clarifying questions to help form a complete plan.

RAW INPUT:
{rawInput}

Return the questions as a JSON array of strings.`;

export const ClarificationSchema = z.object({
  questions: z.array(z.string()).describe('Clarifying questions to ask the founder'),
});

export class Extractor {
  async extract(rawInput: string, additionalContext: string = '', language: string = 'en'): Promise<StructuredPlan> {
    const isShort = rawInput.trim().split(/\s+/).length < 20;

    if (isShort) {
      // Generate clarifying questions instead
      const llm = getLLM('extraction');
      const prompt = PromptTemplate.fromTemplate(CLARIFICATION_TEMPLATE);
      const chain = prompt.pipe(llm.withStructuredOutput(ClarificationSchema));
      const result = await chain.invoke({ rawInput }) as { questions: string[] };

      throw new ClarificationError(result.questions);
    }

    const langInstruction = language === 'zh'
      ? 'Respond in Chinese (Simplified).'
      : 'Respond in English.';

    const llm = getLLM('extraction');
    const prompt = PromptTemplate.fromTemplate(EXTRACTION_TEMPLATE);
    const chain = prompt.pipe(llm.withStructuredOutput(StructuredPlanSchema));

    const result = await chain.invoke({
      rawInput,
      additionalContext: additionalContext || 'None',
      language_instruction: langInstruction,
    }) as StructuredPlan;

    return result;
  }
}

export class ClarificationError extends Error {
  questions: string[];

  constructor(questions: string[]) {
    super('Clarification needed');
    this.questions = questions;
    this.name = 'ClarificationError';
  }
}