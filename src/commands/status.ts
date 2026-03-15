import * as path from 'path'
import * as fse from 'fs-extra'
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

  let anySkills = false
  if (await fse.pathExists(paths.skillsDir)) {
    for (const label of await fse.readdir(paths.skillsDir)) {
      const labelDir = path.join(paths.skillsDir, label)
      for (const skillName of await fse.readdir(labelDir)) {
        anySkills = true
        const centralLink = path.join(labelDir, skillName)
        const live = await isLiveSymlink(centralLink)
        const broken = await isBrokenSymlink(centralLink)
        const health = live
          ? chalk.green('✅ source live')
          : broken ? chalk.yellow('⚠️ broken source') : chalk.gray('?')

        const ref = `${label}/${skillName}`
        log(`  ${ref}   ${health}`)

        const syncEntry = config.syncs.find(s => s.type === 'skill' && s.ref === ref)
        if (!syncEntry || syncEntry.destinations.length === 0) {
          log(chalk.gray('    → (not synced yet)'))
        } else {
          for (const dest of syncEntry.destinations) {
            const destLive = await isLiveSymlink(dest.path)
            const destStatus = destLive ? chalk.green('✅') : chalk.red('✗ missing')
            log(`    → ${dest.path}  [${dest.tool} · ${dest.scope}]  ${destStatus}`)
          }
        }
      }
    }
  }

  if (!anySkills) {
    log(chalk.gray('  (none registered)'))
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
    for (const entry of scopeSyncs) {
      for (const dest of entry.destinations) {
        const destLive = await isLiveSymlink(dest.path)
        const destStatus = destLive ? chalk.green('✅') : chalk.red('✗ missing')
        log(`    → ${dest.path}  [${dest.tool} · ${dest.scope}]  ${destStatus}`)
      }
    }
  }
}
