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
  const skillSyncs = config.syncs.filter(s => s.type === 'skill')

  const skillLabels = await fse.pathExists(paths.skillsDir) ? await fse.readdir(paths.skillsDir) : []
  if (skillLabels.length === 0) {
    log(chalk.gray('  (none registered — run: skillsync skill add)'))
  }

  for (const label of skillLabels) {
    const labelDir = path.join(paths.skillsDir, label)
    const skillNames = await fse.readdir(labelDir)
    for (const skillName of skillNames) {
      const centralLink = path.join(labelDir, skillName)
      const live = await isLiveSymlink(centralLink)
      const broken = await isBrokenSymlink(centralLink)
      const health = live
        ? chalk.green('✅ source live')
        : broken ? chalk.yellow('⚠️ broken source') : chalk.gray('?')

      log(`  ${label}/${skillName}   ${health}`)

      const entry = skillSyncs.find(s => s.ref === `${label}/${skillName}`)
      const destinations = entry?.destinations ?? []
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

  log(chalk.bold('\nInstructions'))
  const instrSyncs = config.syncs.filter(s => s.type === 'instructions')

  if (config.instructions.length === 0) {
    log(chalk.gray('  (none registered — run: skillsync instructions add)'))
  }

  for (const instr of config.instructions) {
    const instrLink = path.join(paths.instructionsDir, `${instr.label}.md`)
    const live = await isLiveSymlink(instrLink)
    const health = live ? chalk.green('✅ source live') : chalk.yellow('⚠️ broken source')
    log(`  ${instr.label}   ${health}`)

    const entry = instrSyncs.find(s => s.ref === instr.label)
    const destinations = entry?.destinations ?? []
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
