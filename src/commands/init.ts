import * as fse from 'fs-extra'
import chalk from 'chalk'
import { makeConfigPaths, DEFAULT_CONFIG, writeConfig } from '../lib/config'

type ConfigPaths = ReturnType<typeof makeConfigPaths>

export async function runInit(paths: ConfigPaths = makeConfigPaths()): Promise<void> {
  await fse.ensureDir(paths.skillsDir)
  await fse.ensureDir(paths.instructionsDir)

  if (!await fse.pathExists(paths.configPath)) {
    await writeConfig(DEFAULT_CONFIG, paths.configPath)
    console.log(chalk.green('✅ Created ~/.skillsync/config.json'))
  } else {
    console.log(chalk.gray('config.json already exists — preserved'))
  }

  console.log(chalk.green('✅ skillsync initialized'))
}
