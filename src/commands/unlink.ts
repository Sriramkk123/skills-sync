import * as path from 'path'
import chalk from 'chalk'
import { PromptAdapter } from '../lib/prompts'
import { makeConfigPaths, readConfig, writeConfig } from '../lib/config'
import { isManagedSymlink, removeSymlink } from '../lib/fs'

type ConfigPaths = ReturnType<typeof makeConfigPaths>

export async function runUnlink(
  prompts: PromptAdapter,
  paths: ConfigPaths = makeConfigPaths(),
  log: (line: string) => void = console.log
): Promise<void> {
  const config = await readConfig(paths.configPath)

  const allDests: Array<{ label: string; path: string; type: string; ref: string }> = []
  for (const entry of config.syncs) {
    for (const dest of entry.destinations) {
      allDests.push({
        label: `[${entry.type}] ${entry.ref} → ${dest.path}`,
        path: dest.path,
        type: entry.type,
        ref: entry.ref,
      })
    }
  }

  if (allDests.length === 0) {
    log(chalk.yellow('No synced destinations found.'))
    return
  }

  const selected = await prompts.select(
    'Which destination to unlink?',
    allDests.map(d => ({ name: d.label, value: d.path }))
  )

  const dest = allDests.find(d => d.path === selected)!

  if (dest.type === 'instructions') {
    const managed = await isManagedSymlink(dest.path, paths.home)
    if (!managed) {
      log(chalk.red(`✗ ${path.basename(dest.path)} is not managed by skillsync — refusing to delete`))
      return
    }
  }

  await removeSymlink(dest.path)
  log(chalk.green(`✅ Removed ${dest.path}`))

  for (const entry of config.syncs) {
    entry.destinations = entry.destinations.filter(d => d.path !== dest.path)
  }
  config.syncs = config.syncs.filter(e => e.destinations.length > 0)
  await writeConfig(config, paths.configPath)
}
