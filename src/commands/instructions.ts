import * as path from 'path'
import * as fse from 'fs-extra'
import chalk from 'chalk'
import { PromptAdapter } from '../lib/prompts'
import { makeConfigPaths, readConfig, writeConfig } from '../lib/config'
import { createSymlink } from '../lib/fs'
import { Scope } from '../types'

type ConfigPaths = ReturnType<typeof makeConfigPaths>

export async function runInstructionsAdd(
  prompts: PromptAdapter,
  paths: ConfigPaths = makeConfigPaths()
): Promise<void> {
  const scope = (await prompts.select('Scope (global or project):', [
    { name: 'global', value: 'global' },
    { name: 'project', value: 'project' },
  ])) as Scope

  const sourcePath = await prompts.input('Source instructions file path:')

  if (!await fse.pathExists(sourcePath)) {
    console.log(chalk.red(`✗ File does not exist: ${sourcePath}`))
    return
  }

  const absSource = path.resolve(sourcePath)
  const linkPath = path.join(paths.instructionsDir, `${scope}.md`)

  if (await fse.pathExists(linkPath)) {
    const overwrite = await prompts.confirm(`${scope}.md already exists. Overwrite?`, false)
    if (!overwrite) {
      console.log(chalk.gray('Aborted.'))
      return
    }
    await fse.remove(linkPath)
  }

  await createSymlink(absSource, linkPath)
  console.log(chalk.green(`✅ ~/.skillsync/instructions/${scope}.md → ${absSource}`))

  const config = await readConfig(paths.configPath)
  config.instructions[scope] = absSource
  await writeConfig(config, paths.configPath)
}
