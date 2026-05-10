import { PromptTemplate } from '@langchain/core/prompts';
import { getLLM } from '../llm/client.js';
import { z } from 'zod';
import type { StructuredPlan } from '../types.js';

const VERIFICATION_TEMPLATE = `You are the Verification Layer for Friction. Your job is to verify the structured plan extraction for accuracy and completeness.

Review the extracted plan below and identify:
1. Any assumptions that were FABRICATED (not present in the original input, even implicitly)
2. Any explicit assumptions that were MISSED
3. Whether confidence scores seem reasonable

ORIGINAL INPUT:
{rawInput}

EXTRACTED PLAN:
{extractedPlan}

Be conservative — only flag clear errors. Minor omissions are acceptable.`;

export const VerificationSchema = z.object({
  isAccurate: z.boolean().describe('Whether the extraction is substantially accurate'),
  fabricatedAssumptions: z.array(z.string()).describe('Assumptions that were fabricated (not in the original input)'),
  missedExplicitAssumptions: z.array(z.string()).describe('Explicit assumptions that were missed'),
  confidenceIssues: z.array(z.string()).describe('Issues with confidence scores'),
  disagreements: z.array(z.string()).describe('Any disagreements between what was extracted and the original input'),
});

export interface VerificationResult {
  isAccurate: boolean;
  fabricatedAssumptions: string[];
  missedExplicitAssumptions: string[];
  confidenceIssues: string[];
  disagreements: string[];
}

export class Verifier {
  async verify(rawInput: string, plan: StructuredPlan): Promise<VerificationResult> {
    const llm = getLLM('verification');
    const prompt = PromptTemplate.fromTemplate(VERIFICATION_TEMPLATE);
    const chain = prompt.pipe(llm.withStructuredOutput(VerificationSchema));

    const result = await chain.invoke({
      rawInput,
      extractedPlan: JSON.stringify(plan, null, 2),
    }) as VerificationResult;

    return result;
  }
}