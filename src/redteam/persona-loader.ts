import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import type { Persona } from '../types.js';
import { BUILTIN_PERSONAS_DIR } from '../storage/paths.js';
import {
  insertPersona, getPersonaByName, listPersonas, getPersonaById,
} from '../storage/database.js';

export function loadBuiltinPersona(name: string): Persona | null {
  const filePath = join(BUILTIN_PERSONAS_DIR, `${name}.yaml`);
  if (!existsSync(filePath)) return null;

  const raw = readFileSync(filePath, 'utf-8');
  const data = parse(raw);

  const persona: Persona = {
    id: data.id || name,
    name: data.name || name,
    displayName: data.displayName || name,
    description: data.description || '',
    isCustom: false,
    systemPrompt: data.systemPrompt || '',
    domain: data.domain || null,
    config: {
      temperature: data.config?.temperature ?? 0.8,
      focusCategories: data.config?.focusCategories || [],
    },
  };

  return persona;
}

export function seedBuiltinPersonas(): void {
  const names = ['devils_advocate', 'domain_expert', 'customer_skeptic', 'tech_debt_guardian'];

  for (const name of names) {
    const existing = getPersonaByName(name);
    if (existing) continue;

    const persona = loadBuiltinPersona(name);
    if (persona) {
      insertPersona(persona);
    }
  }
}

export { listPersonas, getPersonaById, getPersonaByName };