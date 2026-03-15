import * as path from 'path'
import chalk from 'chalk'
import { makeConfigPaths, readConfig } from '../lib/config'
import { isLiveSymlink, isBrokenSymlink } from '../lib/fs'

type ConfigPaths = ReturnType<typeof makeConfigPaths>

export async function runStatus(
  paths: ConfigPaths = makeConfigPaths(),
  log: (line: string) => void = console.log
): Promise<void> {
  const config = await readConfig(paths.configPath)

  log(chalk.bold('\nSkills'))
  const skillSyncs = config.syncs.filter(s => s.type === 'skill')

  if (skillSyncs.length === 0) {
    log(chalk.gray('  (none synced — run: skillsync skill list)'))
  }

  for (const entry of skillSyncs) {
    const [label, skillName] = entry.ref.split('/')
    const centralLink = path.join(paths.skillsDir, label, skillName)
    const live = await isLiveSymlink(centralLink)
    const broken = await isBrokenSymlink(centralLink)
    const health = live
      ? chalk.green('✅ source live')
      : broken ? chalk.yellow('⚠️ broken source') : chalk.gray('?')

    log(`  ${entry.ref}   ${health}`)

    for (const dest of entry.destinations) {
      const destLive = await isLiveSymlink(dest.path)
      const destStatus = destLive ? chalk.green('✅') : chalk.red('✗ missing')
      log(`    → ${dest.path}  [${dest.tool} · ${dest.scope}]  ${destStatus}`)
    }
  }

  log(chalk.bold('\nInstructions'))
  const instrSyncs = config.syncs.filter(s => s.type === 'instructions')

  if (instrSyncs.length === 0 && Object.keys(config.instructions).length === 0) {
    log(chalk.gray('  (none registered)'))
  }

  for (const scope of ['global', 'project'] as const) {
    const sourcePath = config.instructions[scope]
    if (!sourcePath) continue

    const instrLink = path.join(paths.instructionsDir, `${scope}.md`)
    const live = await isLiveSymlink(instrLink)
    const health = live ? chalk.green('✅ source live') : chalk.yellow('⚠️ broken source')
    log(`  ${scope}   ${health}  (${sourcePath})`)

    const scopeSyncs = instrSyncs.filter(s => s.ref === scope)
    const destinations = scopeSyncs.flatMap(e => e.destinations)
    if (destinations.length === 0) {
      log(chalk.gray('    → (not synced yet)'))
    } else {
      for (const dest of destinations) {
        const destLive = await isLiveSymlink(dest.path)
        const destStatus = destLive ? chalk.green('✅') : chalk.red('✗ missing')
        log(`    → ${dest.path}  [${dest.tool} · ${dest.scope}]  ${destStatus}`)
      }
    }
  }
}
