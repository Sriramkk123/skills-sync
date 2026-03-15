import * as path from 'path'
import * as fse from 'fs-extra'
import chalk from 'chalk'
import { PromptAdapter } from '../lib/prompts'
import { makeConfigPaths, readConfig, writeConfig } from '../lib/config'
import { createSymlink, isManagedSymlink, removeSymlink } from '../lib/fs'
import { TOOLS, getInstructionDestPath } from '../tools/registry'
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

  // Source tool selection tells us which filename to look for
  const sourceToolId = await prompts.select(
    'Source tool:',
    TOOLS.map(t => ({ name: t.name, value: t.id }))
  )
  const sourceTool = TOOLS.find(t => t.id === sourceToolId)!
  const sourceFileName = scope === 'global'
    ? sourceTool.globalInstructionFile
    : sourceTool.projectInstructionFile

  const sourcePath = await prompts.input('Source path (directory or file):')

  let absSource = path.resolve(sourcePath)
  let stat: fse.Stats
  try {
    stat = await fse.stat(absSource)
  } catch {
    log(chalk.red(`✗ Path does not exist: ${sourcePath}`))
    return
  }

  if (stat.isDirectory()) {
    const candidate = path.join(absSource, sourceFileName)
    if (!await fse.pathExists(candidate)) {
      log(chalk.red(`✗ ${sourceFileName} not found in ${absSource}`))
      return
    }
    absSource = candidate
    log(chalk.gray(`  Using ${sourceFileName} from directory`))
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

  // Select destination tools
  const destToolIds = await prompts.multiselect(
    'Sync to which tools? (↑↓ navigate, Space select, a = all, Enter confirm)',
    TOOLS.map(t => ({ name: t.name, value: t.id }))
  )

  const config = await readConfig(paths.configPath)
  config.instructions[scope] = absSource

  if (destToolIds.length === 0) {
    log(chalk.yellow('No destinations selected. Instructions registered but not synced.'))
    await writeConfig(config, paths.configPath)
    return
  }

  let projectDir: string | undefined
  if (scope === 'project') {
    projectDir = await prompts.input('Project directory:')
  }

  for (const toolId of destToolIds) {
    const tool = TOOLS.find(t => t.id === toolId)!
    const defaultDest = getInstructionDestPath(tool, scope, projectDir)

    const destPath = await prompts.input(
      `Destination for ${tool.name} (${scope}):`,
      defaultDest
    )

    const parentDir = path.dirname(destPath)
    if (!await fse.pathExists(parentDir)) {
      log(chalk.yellow(`⚠️  Parent directory does not exist: ${parentDir}`))
      continue
    }

    if (await fse.pathExists(destPath)) {
      const managed = await isManagedSymlink(destPath, paths.home)
      if (!managed) {
        const replace = await prompts.confirm(
          `${path.basename(destPath)} already exists and is not managed by skillsync. Replace with symlink?`,
          false
        )
        if (!replace) continue
      }
      await fse.remove(destPath)
    }

    await createSymlink(instrLink, destPath)
    log(chalk.green(`✅ ${destPath} → ${instrLink}`))

    let entry = config.syncs.find(s => s.ref === scope && s.type === 'instructions')
    if (!entry) {
      entry = { type: 'instructions', ref: scope, destinations: [] }
      config.syncs.push(entry)
    }
    if (!entry.destinations.find(d => d.path === destPath)) {
      entry.destinations.push({ tool: toolId, path: destPath, scope })
    }
  }

  await writeConfig(config, paths.configPath)
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
