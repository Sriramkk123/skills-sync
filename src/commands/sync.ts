import * as path from 'path'
import * as fse from 'fs-extra'
import chalk from 'chalk'
import { PromptAdapter } from '../lib/prompts'
import { makeConfigPaths, readConfig, writeConfig } from '../lib/config'
import { createSymlink, isLiveSymlink, isBrokenSymlink, isManagedSymlink } from '../lib/fs'
import { TOOLS, getInstructionDestPath } from '../tools/registry'
import { Scope } from '../types'

type ConfigPaths = ReturnType<typeof makeConfigPaths>

export async function runSync(
  prompts: PromptAdapter,
  paths: ConfigPaths = makeConfigPaths(),
  log: (line: string) => void = console.log
): Promise<void> {
  const syncType = await prompts.select('What to sync?', [
    { name: 'Skills', value: 'skills' },
    { name: 'Instructions', value: 'instructions' },
    { name: 'Both', value: 'both' },
  ])

  if (syncType === 'skills' || syncType === 'both') {
    await syncSkills(prompts, paths, log)
  }
  if (syncType === 'instructions' || syncType === 'both') {
    await syncInstructions(prompts, paths, log)
  }
}

async function syncSkills(
  prompts: PromptAdapter,
  paths: ConfigPaths,
  log: (line: string) => void
): Promise<void> {
  const available: Array<{ name: string; value: string }> = []
  if (await fse.pathExists(paths.skillsDir)) {
    for (const label of await fse.readdir(paths.skillsDir)) {
      const labelDir = path.join(paths.skillsDir, label)
      for (const skill of await fse.readdir(labelDir)) {
        available.push({ name: `${label}/${skill}`, value: `${label}/${skill}` })
      }
    }
  }

  if (available.length === 0) {
    log(chalk.yellow('No skills registered. Run: skillsync skill add'))
    return
  }

  const selected = await prompts.multiselect('Which skills? (↑↓ navigate, Space select, a = all, Enter confirm)', available)
  if (selected.length === 0) {
    log(chalk.yellow('No skills selected. Aborting.'))
    return
  }

  const toolIds = await prompts.multiselect(
    'Which tool(s)? (↑↓ navigate, Space select, a = all, Enter confirm)',
    TOOLS.map(t => ({ name: t.name, value: t.id }))
  )
  if (toolIds.length === 0) {
    log(chalk.yellow('No tools selected. Aborting.'))
    return
  }

  const copyTools = toolIds.filter(id => TOOLS.find(t => t.id === id)?.usesCopy)
  if (copyTools.length > 0) {
    const names = copyTools.map(id => TOOLS.find(t => t.id === id)!.name).join(', ')
    log(chalk.yellow(`⚠️  ${names} does not support symlinks — skills will be copied instead.`))
    log(chalk.yellow(`   Edits made in ${names} will NOT reflect back at the source.`))
  }
  const scope = (await prompts.select('Scope:', [
    { name: 'global', value: 'global' },
    { name: 'project', value: 'project' },
  ])) as Scope

  let projectDir: string | undefined
  if (scope === 'project') {
    projectDir = await prompts.input('Project directory:')
  }

  // Resolve destination directory once per tool (not per skill)
  const toolDestDirs = new Map<string, string>()
  for (const toolId of toolIds) {
    const tool = TOOLS.find(t => t.id === toolId)!
    const baseDir = scope === 'global'
      ? tool.globalSkillsDir
      : path.join(projectDir!, tool.projectSkillsDir)

    const destDir = await prompts.input(
      `Destination directory for ${tool.name} skills (${scope}):`,
      baseDir
    )
    toolDestDirs.set(toolId, destDir)
  }

  const config = await readConfig(paths.configPath)

  for (const skillRef of selected) {
    const [label, skillName] = skillRef.split('/')
    const centralLink = path.join(paths.skillsDir, label, skillName)

    if (!await isLiveSymlink(centralLink)) {
      log(chalk.yellow(`⚠️  Skipping ${skillRef} — central store symlink is broken`))
      continue
    }

    for (const toolId of toolIds) {
      const tool = TOOLS.find(t => t.id === toolId)!
      const destDir = toolDestDirs.get(toolId)!

      if (!await fse.pathExists(destDir)) {
        const create = await prompts.confirm(
          `${destDir} does not exist. Create it?`,
          true
        )
        if (!create) {
          log(chalk.yellow(`⚠️  Skipping ${tool.name} — destination does not exist: ${destDir}`))
          continue
        }
        await fse.ensureDir(destDir)
        log(chalk.green(`✅ Created ${destDir}`))
      }

      const destLink = path.join(destDir, skillName)

      if (await fse.pathExists(destLink) || await isBrokenSymlink(destLink)) {
        const choice = await prompts.select(
          `${skillName} already exists at destination. Overwrite?`,
          [
            { name: 'overwrite', value: 'overwrite' },
            { name: 'skip', value: 'skip' },
            { name: 'abort', value: 'abort' },
          ]
        )
        if (choice === 'abort') return
        if (choice === 'skip') continue
        await fse.remove(destLink)
      }

      if (tool.usesCopy) {
        const realSource = await fse.realpath(centralLink)
        await fse.copy(realSource, destLink, { overwrite: true })
        log(chalk.green(`✅ ${destLink} (copy from ${realSource})`))
      } else {
        await createSymlink(centralLink, destLink)
        log(chalk.green(`✅ ${destLink} → ${centralLink}`))
      }

      let entry = config.syncs.find(s => s.ref === skillRef && s.type === 'skill')
      if (!entry) {
        entry = { type: 'skill', ref: skillRef, destinations: [] }
        config.syncs.push(entry)
      }
      const absDestLink = path.resolve(destLink)
      if (!entry.destinations.find(d => d.path === absDestLink)) {
        entry.destinations.push({ tool: toolId, path: absDestLink, scope })
      }
    }
  }

  await writeConfig(config, paths.configPath)
}

async function syncInstructions(
  prompts: PromptAdapter,
  paths: ConfigPaths,
  log: (line: string) => void
): Promise<void> {
  const scope = (await prompts.select('Scope:', [
    { name: 'global', value: 'global' },
    { name: 'project', value: 'project' },
  ])) as Scope

  const instrLink = path.join(paths.instructionsDir, `${scope}.md`)

  if (!await isLiveSymlink(instrLink)) {
    log(chalk.red(`✗ No ${scope} instructions registered. Run: skillsync instructions add`))
    return
  }

  const toolIds = await prompts.multiselect(
    'Which tool(s)? (↑↓ navigate, Space select, a = all, Enter confirm)',
    TOOLS.map(t => ({ name: t.name, value: t.id }))
  )

  let projectDir: string | undefined
  if (scope === 'project') {
    projectDir = await prompts.input('Project directory:')
  }

  const config = await readConfig(paths.configPath)

  for (const toolId of toolIds) {
    const tool = TOOLS.find(t => t.id === toolId)!
    const defaultDest = getInstructionDestPath(tool, scope, projectDir)

    const destPath = await prompts.input(
      `Destination for ${tool.name} instructions (${scope}):`,
      defaultDest
    )

    if (!await fse.pathExists(path.dirname(destPath))) {
      log(chalk.yellow(`⚠️  Parent directory does not exist: ${path.dirname(destPath)}`))
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
