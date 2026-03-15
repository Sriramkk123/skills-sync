import * as fse from 'fs-extra'
import * as path from 'path'
import * as os from 'os'
import { Config, Scope, SyncType } from '../types'

const VALID_SYNC_TYPES: readonly SyncType[] = ['skill', 'instructions']
const VALID_SCOPES: readonly Scope[] = ['global', 'project']

function assertObject(val: unknown, context: string): Record<string, unknown> {
  if (typeof val !== 'object' || val === null) {
    throw new Error(`Invalid config: ${context} must be an object`)
  }
  return val as Record<string, unknown>
}

export const SKILLSYNC_HOME = path.join(os.homedir(), '.skillsync')
export const SKILLS_DIR = path.join(SKILLSYNC_HOME, 'skills')
export const INSTRUCTIONS_DIR = path.join(SKILLSYNC_HOME, 'instructions')

export function makeConfigPaths(home: string = SKILLSYNC_HOME) {
  return {
    home,
    skillsDir: path.join(home, 'skills'),
    instructionsDir: path.join(home, 'instructions'),
    configPath: path.join(home, 'config.json'),
  }
}

export const DEFAULT_CONFIG: Config = {
  sources: [],
  instructions: [],
  syncs: [],
}

function validateConfig(raw: unknown): Config {
  const obj = assertObject(raw, 'root')

  if (!Array.isArray(obj.sources)) {
    throw new Error('Invalid config: "sources" must be an array')
  }
  for (const s of obj.sources) {
    const src = assertObject(s, 'sources entry')
    if (typeof src.label !== 'string') throw new Error('Invalid config: sources[].label must be a string')
    if (typeof src.path !== 'string') throw new Error('Invalid config: sources[].path must be a string')
  }

  if (!Array.isArray(obj.instructions)) {
    throw new Error('Invalid config: "instructions" must be an array')
  }
  for (const i of obj.instructions) {
    const instr = assertObject(i, 'instructions entry')
    if (typeof instr.label !== 'string') throw new Error('Invalid config: instructions[].label must be a string')
    if (typeof instr.path !== 'string') throw new Error('Invalid config: instructions[].path must be a string')
  }

  if (!Array.isArray(obj.syncs)) {
    throw new Error('Invalid config: "syncs" must be an array')
  }
  for (const s of obj.syncs) {
    const sync = assertObject(s, 'syncs entry')
    if (!VALID_SYNC_TYPES.includes(sync.type as SyncType)) {
      throw new Error(`Invalid config: syncs[].type must be one of ${VALID_SYNC_TYPES.join(', ')}, got "${sync.type}"`)
    }
    if (typeof sync.ref !== 'string') throw new Error('Invalid config: syncs[].ref must be a string')
    if (!Array.isArray(sync.destinations)) throw new Error('Invalid config: syncs[].destinations must be an array')
    for (const d of sync.destinations) {
      const dest = assertObject(d, 'syncs[].destinations entry')
      if (typeof dest.tool !== 'string') throw new Error('Invalid config: syncs[].destinations[].tool must be a string')
      if (typeof dest.path !== 'string') throw new Error('Invalid config: syncs[].destinations[].path must be a string')
      if (!VALID_SCOPES.includes(dest.scope as Scope)) {
        throw new Error(`Invalid config: syncs[].destinations[].scope must be one of ${VALID_SCOPES.join(', ')}, got "${dest.scope}"`)
      }
    }
  }

  return raw as Config
}

export async function readConfig(configPath: string = makeConfigPaths().configPath): Promise<Config> {
  if (!await fse.pathExists(configPath)) {
    throw new Error('skillsync not initialized. Run: skillsync init')
  }
  const raw = await fse.readJson(configPath)
  return validateConfig(raw)
}

export async function writeConfig(
  config: Config,
  configPath: string = makeConfigPaths().configPath
): Promise<void> {
  await fse.writeJson(configPath, config, { spaces: 2 })
}

export async function isInitialized(configPath: string = makeConfigPaths().configPath): Promise<boolean> {
  return fse.pathExists(configPath)
}
