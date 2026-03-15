import * as path from 'path'
import * as fse from 'fs-extra'
import chalk from 'chalk'
import { PromptAdapter } from '../lib/prompts'
import { makeConfigPaths, readConfig, writeConfig } from '../lib/config'
import { createSymlink, removeSymlink } from '../lib/fs'
import { Scope } from '../types'

type ConfigPaths = ReturnType<typeof makeConfigPaths>

export async function runInstructionsAdd(
  prompts: PromptAdapter,
  paths: ConfigPaths = makeConfigPaths(),
  log: (line: string) => void = console.log
): Promise<void> {
  const scope = (await prompts.select('Scope (global or project):', [
    { name: 'global', value: 'global' },
    { name: 'project', value: 'project' },
  ])) as Scope

  const sourcePath = await prompts.input('Source file path (e.g. /path/to/CLAUDE.md):')

  const absSource = path.resolve(sourcePath)
  try {
    const stat = await fse.stat(absSource)
    if (stat.isDirectory()) {
      log(chalk.red(`✗ Expected a file, got a directory: ${absSource}`))
      return
    }
  } catch {
    log(chalk.red(`✗ Path does not exist: ${sourcePath}`))
    return
  }

  // Register in central store
  const instrLink = path.join(paths.instructionsDir, `${scope}.md`)

  if (await fse.pathExists(instrLink)) {
    const overwrite = await prompts.confirm(`${scope}.md already exists. Overwrite?`, false)
    if (!overwrite) {
      log(chalk.gray('Aborted.'))
      return
    }
    await fse.remove(instrLink)
  }

  await createSymlink(absSource, instrLink)
  log(chalk.green(`✅ Central store: ~/.skillsync/instructions/${scope}.md → ${absSource}`))

  const config = await readConfig(paths.configPath)
  config.instructions[scope] = absSource
  await writeConfig(config, paths.configPath)
  log(chalk.gray('  Run: skillsync sync → instructions to distribute to tools'))
}

export async function runInstructionsRemove(
  prompts: PromptAdapter,
  paths: ConfigPaths = makeConfigPaths(),
  log: (line: string) => void = console.log
): Promise<void> {
  const config = await readConfig(paths.configPath)

  const registered = Object.entries(config.instructions) as [Scope, string][]
  if (registered.length === 0) {
    log(chalk.yellow('No instructions registered.'))
    return
  }

  const scope = (await prompts.select(
    'Which instructions to remove?',
    registered.map(([s, filePath]) => ({ name: `${s} (${filePath})`, value: s }))
  )) as Scope

  const entry = config.syncs.find(e => e.type === 'instructions' && e.ref === scope)
  const destinations = entry?.destinations ?? []

  const confirmed = await prompts.confirm(
    `Remove ${scope} instructions and ${destinations.length} destination symlink(s)?`,
    false
  )
  if (!confirmed) {
    log(chalk.gray('Aborted.'))
    return
  }

  await Promise.all(destinations.map(async (dest) => {
    try {
      await removeSymlink(dest.path)
      log(chalk.green(`✅ Removed ${dest.path}`))
    } catch {
      log(chalk.yellow(`⚠️  ${dest.path} not on disk — removing from config`))
    }
  }))

  const instrLink = path.join(paths.instructionsDir, `${scope}.md`)
  try {
    await removeSymlink(instrLink)
    log(chalk.green(`✅ Removed central store: ~/.skillsync/instructions/${scope}.md`))
  } catch {
    log(chalk.yellow(`⚠️  Central store symlink not found — removing from config`))
  }

  delete config.instructions[scope]
  config.syncs = config.syncs.filter(e => !(e.type === 'instructions' && e.ref === scope))
  await writeConfig(config, paths.configPath)
}
