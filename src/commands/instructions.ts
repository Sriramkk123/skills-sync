import * as path from 'path'
import * as fse from 'fs-extra'
import chalk from 'chalk'
import { PromptAdapter } from '../lib/prompts'
import { makeConfigPaths, readConfig, writeConfig } from '../lib/config'
import { createSymlink, removeSymlink } from '../lib/fs'

type ConfigPaths = ReturnType<typeof makeConfigPaths>

export async function runInstructionsAdd(
  prompts: PromptAdapter,
  paths: ConfigPaths = makeConfigPaths(),
  log: (line: string) => void = console.log
): Promise<void> {
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

  const label = await prompts.input('Label for this instructions source:')

  const validLabel = /^[a-zA-Z0-9][a-zA-Z0-9_\-:.@]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/.test(label)
  if (!validLabel) {
    log(chalk.red(`✗ Invalid label "${label}": use only letters, numbers, hyphens, underscores, colons, dots, or @`))
    return
  }

  const config = await readConfig(paths.configPath)
  const existing = config.instructions.find(i => i.label === label)

  if (existing) {
    const overwrite = await prompts.confirm(`Label "${label}" already registered. Overwrite?`, false)
    if (!overwrite) {
      log(chalk.gray('Aborted.'))
      return
    }
    const oldLink = path.join(paths.instructionsDir, `${label}.md`)
    await fse.remove(oldLink)
    config.instructions = config.instructions.filter(i => i.label !== label)
  }

  const instrLink = path.join(paths.instructionsDir, `${label}.md`)
  await createSymlink(absSource, instrLink)
  log(chalk.green(`✅ Central store: ~/.skillsync/instructions/${label}.md → ${absSource}`))

  config.instructions.push({ label, path: absSource })
  await writeConfig(config, paths.configPath)
  log(chalk.gray('  Run: skillsync sync → instructions to distribute to tools'))
}

export async function runInstructionsRemove(
  prompts: PromptAdapter,
  paths: ConfigPaths = makeConfigPaths(),
  log: (line: string) => void = console.log
): Promise<void> {
  const config = await readConfig(paths.configPath)

  if (config.instructions.length === 0) {
    log(chalk.yellow('No instructions registered.'))
    return
  }

  const label = await prompts.select(
    'Which instructions to remove?',
    config.instructions.map(i => ({ name: `${i.label} — ${i.path}`, value: i.label }))
  )

  const entry = config.syncs.find(e => e.type === 'instructions' && e.ref === label)
  const destinations = entry?.destinations ?? []

  const confirmed = await prompts.confirm(
    `Remove "${label}" and ${destinations.length} destination symlink(s)?`,
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

  const instrLink = path.join(paths.instructionsDir, `${label}.md`)
  try {
    await removeSymlink(instrLink)
    log(chalk.green(`✅ Removed central store: ~/.skillsync/instructions/${label}.md`))
  } catch {
    log(chalk.yellow(`⚠️  Central store symlink not found — removing from config`))
  }

  config.instructions = config.instructions.filter(i => i.label !== label)
  config.syncs = config.syncs.filter(e => !(e.type === 'instructions' && e.ref === label))
  await writeConfig(config, paths.configPath)
}
