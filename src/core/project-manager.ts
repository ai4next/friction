import { v4 as uuid } from 'uuid';
import type { Project, PersonaConfig, UUID } from '../types.js';
import {
  insertProject, getProjectById, getProjectByName, listProjects, deleteProject,
  updateProjectTimestamp, getDb,
} from '../storage/database.js';
import { getPersonaByName } from '../storage/database.js';

const DEFAULT_PERSONA_NAMES = ['devils_advocate', 'domain_expert', 'customer_skeptic', 'tech_debt_guardian'];

export class ProjectManager {
  create(name: string, domain: string, description?: string): Project {
    const existing = getProjectByName(name);
    if (existing) {
      throw new Error(`Project "${name}" already exists`);
    }

    const activePersonas: PersonaConfig[] = [];
    for (const personaName of DEFAULT_PERSONA_NAMES) {
      const persona = getPersonaByName(personaName);
      if (persona) {
        activePersonas.push({ personaId: persona.id, enabled: true });
      }
    }

    const now = new Date();
    const project: Project = {
      id: uuid(),
      name,
      description: description || null,
      domain,
      createdAt: now,
      updatedAt: now,
      activePersonas,
    };

    insertProject(project);
    return project;
  }

  get(idOrName: string): Project | null {
    return getProjectById(idOrName) || getProjectByName(idOrName);
  }

  list(): Project[] {
    return listProjects();
  }

  delete(idOrName: string): boolean {
    const project = this.get(idOrName);
    if (!project) return false;
    deleteProject(project.id);
    return true;
  }

  togglePersona(projectId: UUID, personaName: string, enabled: boolean): boolean {
    const persona = getPersonaByName(personaName);
    if (!persona) return false;

    const db = getDb();
    const result = db.prepare(
      'UPDATE project_personas SET enabled = ? WHERE project_id = ? AND persona_id = ?'
    ).run(enabled ? 1 : 0, projectId, persona.id);
    updateProjectTimestamp(projectId);
    return result.changes > 0;
  }
}