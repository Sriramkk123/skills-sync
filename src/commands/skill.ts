import * as path from 'path'
import * as fse from 'fs-extra'
import chalk from 'chalk'
import { PromptAdapter } from '../lib/prompts'
import { makeConfigPaths, readConfig, writeConfig } from '../lib/config'
import { createSymlink, isLiveSymlink, isBrokenSymlink } from '../lib/fs'

type ConfigPaths = ReturnType<typeof makeConfigPaths>

export async function runSkillAdd(
  prompts: PromptAdapter,
  paths: ConfigPaths = makeConfigPaths(),
  log: (line: string) => void = console.log
): Promise<void> {
  const sourcePath = await prompts.input(
    'Source path (skill directory or parent directory containing skills):'
  )

  if (!await fse.pathExists(sourcePath)) {
    log(chalk.red(`✗ Path does not exist: ${sourcePath}`))
    return runSkillAdd(prompts, paths, log)
  }

  const absSource = path.resolve(sourcePath)

  // Determine if single skill or parent dir (has SKILL.md = single skill)
  const isSingleSkill = await fse.pathExists(path.join(absSource, 'SKILL.md'))
  let skillPaths: string[]

  if (!isSingleSkill) {
    const entries = await fse.readdir(absSource)
    const stats = await Promise.all(entries.map(e => fse.stat(path.join(absSource, e)).then(s => ({ name: e, isDir: s.isDirectory() }))))
    const dirs = stats.filter(s => s.isDir).map(s => s.name)
    if (dirs.length === 0) {
      log(chalk.yellow('No skill subdirectories found.'))
      return
    }
    const choices = dirs.map(d => ({ name: d, value: d }))
    const picked = await prompts.multiselect(
      'Which skills to register? (↑↓ navigate, Space select, a = all, Enter confirm)',
      choices
    )
    skillPaths = picked.map(name => path.join(absSource, name))
  } else {
    skillPaths = [absSource]
  }

  const label = await prompts.input('Label for this source:', path.basename(absSource))

  // Validate label is a safe directory name (no path separators or traversal)
  const validLabel = /^[a-zA-Z0-9][a-zA-Z0-9_\-:.@]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/.test(label)
  if (!validLabel) {
    log(chalk.red(`✗ Invalid label "${label}": labels must contain only letters, numbers, hyphens, underscores, colons, dots, or @`))
    return
  }

  const config = await readConfig(paths.configPath)

  const existingSource = config.sources.find(s => s.label === label)
  if (existingSource && existingSource.path !== absSource) {
    const confirmed = await prompts.confirm(
      `Label "${label}" already points to ${existingSource.path}. Update to new path?`,
      false
    )
    if (!confirmed) return
  }

  for (const skillPath of skillPaths) {
    const skillName = path.basename(skillPath)
    const linkPath = path.join(paths.skillsDir, label, skillName)

    if (await fse.pathExists(linkPath)) {
      log(chalk.yellow(`⚠️  Already registered, skipping: ${label}/${skillName}`))
      continue
    }

    await createSymlink(skillPath, linkPath)
    log(chalk.green(`✅ ${label}/${skillName}`))
  }

  if (!existingSource) {
    config.sources.push({ label, path: absSource })
  } else if (existingSource.path !== absSource) {
    existingSource.path = absSource
  }
  await writeConfig(config, paths.configPath)
}

export async function runSkillRemove(
  prompts: PromptAdapter,
  paths: ConfigPaths = makeConfigPaths(),
  log: (line: string) => void = console.log
): Promise<void> {
  const config = await readConfig(paths.configPath)

  if (config.sources.length === 0) {
    log(chalk.yellow('No sources registered.'))
    return
  }

  const label = await prompts.select(
    'Which source to remove from?',
    config.sources.map(s => ({ name: `${s.label} (${s.path})`, value: s.label }))
  )

  const labelDir = path.join(paths.skillsDir, label)
  const skills = await fse.pathExists(labelDir) ? await fse.readdir(labelDir) : []

  if (skills.length === 0) {
    config.sources = config.sources.filter(s => s.label !== label)
    await writeConfig(config, paths.configPath)
    log(chalk.green(`✅ Removed "${label}" from config`))
    return
  }

  const choices = skills.map(s => ({ name: s, value: s }))
  const picked = await prompts.multiselect(
    'Which skills to remove? (↑↓ navigate, Space select, a = all, Enter confirm)',
    choices
  )
  if (picked.length === 0) {
    log(chalk.yellow('Nothing selected. Aborting.'))
    return
  }

  for (const skill of picked) {
    await fse.remove(path.join(labelDir, skill))
    log(chalk.green(`✅ Removed central store: ${label}/${skill}`))
  }

  const remaining = skills.filter(s => !picked.includes(s))
  if (remaining.length === 0) {
    if (await fse.pathExists(labelDir)) await fse.remove(labelDir)
    config.sources = config.sources.filter(s => s.label !== label)
    log(chalk.green(`✅ Removed "${label}" from config`))
  }

  await writeConfig(config, paths.configPath)
}

export async function runSkillList(
  paths: ConfigPaths = makeConfigPaths(),
  log: (line: string) => void = console.log
): Promise<void> {
  if (!await fse.pathExists(paths.skillsDir)) {
    log(chalk.yellow('No skills registered. Run: skillsync skill add'))
    return
  }

  const labels = await fse.readdir(paths.skillsDir)
  if (labels.length === 0) {
    log(chalk.yellow('No skills registered. Run: skillsync skill add'))
    return
  }

  for (const label of labels) {
    const labelDir = path.join(paths.skillsDir, label)
    const skills = await fse.readdir(labelDir)
    for (const skill of skills) {
      const linkPath = path.join(labelDir, skill)
      const live = await isLiveSymlink(linkPath)
      const broken = await isBrokenSymlink(linkPath)
      const status = live ? chalk.green('✅') : broken ? chalk.yellow('⚠️ broken') : '?'
      log(`  ${status}  ${label}/${skill}`)
    }
  }
}
