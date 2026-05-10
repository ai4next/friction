import { readFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const FRICTION_HOME = join(homedir(), '.frict');
export const DB_PATH = join(FRICTION_HOME, 'friction.db');
export const CONFIG_PATH = join(FRICTION_HOME, 'config.json');
export const PERSONAS_DIR = join(__dirname, '..', '..', 'personas');
export const BUILTIN_PERSONAS_DIR = join(PERSONAS_DIR, 'built-in');

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function ensureFrictionHome(): void {
  ensureDir(FRICTION_HOME);
  ensureDir(join(FRICTION_HOME, 'projects'));
  ensureDir(join(FRICTION_HOME, 'exports'));
}

export function getDbPath(): string {
  ensureFrictionHome();
  return DB_PATH;
}