import * as path from 'path'
import chalk from 'chalk'
import { PromptAdapter } from '../lib/prompts'
import { makeConfigPaths, readConfig, writeConfig } from '../lib/config'
import { isManagedSymlink, removeSymlink } from '../lib/fs'
import { withAllOption, resolveAll } from '../lib/select'

type ConfigPaths = ReturnType<typeof makeConfigPaths>

interface DestEntry {
  label: string
  path: string
  type: string
  ref: string
  dir: string
}

export async function runUnlink(
  prompts: PromptAdapter,
  paths: ConfigPaths = makeConfigPaths(),
  log: (line: string) => void = console.log
): Promise<void> {
  const config = await readConfig(paths.configPath)

  const allDests: DestEntry[] = []
  for (const entry of config.syncs) {
    for (const dest of entry.destinations) {
      allDests.push({
        label: entry.ref,
        path: dest.path,
        type: entry.type,
        ref: entry.ref,
        dir: path.dirname(dest.path),
      })
    }
  }

  if (allDests.length === 0) {
    log(chalk.yellow('No synced destinations found.'))
    return
  }

  // Step 1: pick a destination directory
  const uniqueDirs = [...new Set(allDests.map(d => d.dir))]
  const selectedDir = await prompts.select(
    'Which directory to unlink from?',
    uniqueDirs.map(d => ({ name: d, value: d }))
  )

  const inDir = allDests.filter(d => d.dir === selectedDir)
  const choices = inDir.map(d => ({ name: d.label, value: d.path }))

  // Step 2: pick skills (with All option)
  const picked = await prompts.multiselect(
    'Which skills to unlink? (↑↓ navigate, Space select, a = all, Enter confirm)',
    withAllOption(choices)
  )
  if (picked.length === 0) {
    log(chalk.yellow('Nothing selected. Aborting.'))
    return
  }

  const pathsToRemove = resolveAll(picked, choices)
  const toRemove = inDir.filter(d => pathsToRemove.includes(d.path))

  for (const dest of toRemove) {
    if (dest.type === 'instructions') {
      const managed = await isManagedSymlink(dest.path, paths.home)
      if (!managed) {
        log(chalk.red(`✗ ${path.basename(dest.path)} is not managed by skillsync — skipping`))
        continue
      }
    }
    try {
      await removeSymlink(dest.path)
      log(chalk.green(`✅ Removed ${dest.path}`))
    } catch {
      log(chalk.yellow(`⚠️  ${dest.path} not on disk — removing from config`))
    }
    for (const entry of config.syncs) {
      entry.destinations = entry.destinations.filter(d => d.path !== dest.path)
    }
  }

  config.syncs = config.syncs.filter(e => e.destinations.length > 0)
  await writeConfig(config, paths.configPath)
}
