import * as fse from 'fs-extra'
import * as path from 'path'
import * as os from 'os'
import { Config } from '../types'

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
  instructions: {},
  syncs: [],
}

export async function readConfig(configPath: string = makeConfigPaths().configPath): Promise<Config> {
  if (!await fse.pathExists(configPath)) {
    throw new Error('skillsync not initialized. Run: skillsync init')
  }
  return fse.readJson(configPath)
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
