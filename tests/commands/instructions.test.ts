import * as os from 'os'
import * as path from 'path'
import * as fse from 'fs-extra'
import { runInstructionsAdd } from '../../src/commands/instructions'
import { makeConfigPaths, readConfig, writeConfig, DEFAULT_CONFIG } from '../../src/lib/config'
import { makeMockPrompts } from '../../src/lib/prompts'

let tmpDir: string
let paths: ReturnType<typeof makeConfigPaths>

beforeEach(async () => {
  tmpDir = await fse.mkdtemp(path.join(os.tmpdir(), 'skillsync-instr-'))
  paths = makeConfigPaths(path.join(tmpDir, '.skillsync'))
  await fse.ensureDir(paths.instructionsDir)
  await writeConfig(DEFAULT_CONFIG, paths.configPath)
})

afterEach(async () => {
  await fse.remove(tmpDir)
})

describe('runInstructionsAdd', () => {
  it('creates central store symlink for global instructions', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# My instructions')

    const prompts = makeMockPrompts({
      'Scope (global or project):': 'global',
      'Source instructions file path:': source,
    })

    await runInstructionsAdd(prompts, paths)

    const linkPath = path.join(paths.instructionsDir, 'global.md')
    const stat = await fse.lstat(linkPath)
    expect(stat.isSymbolicLink()).toBe(true)
    expect(await fse.readlink(linkPath)).toBe(source)
  })

  it('updates config.json instructions key', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# My instructions')

    const prompts = makeMockPrompts({
      'Scope (global or project):': 'global',
      'Source instructions file path:': source,
    })

    await runInstructionsAdd(prompts, paths)

    const config = await readConfig(paths.configPath)
    expect(config.instructions.global).toBe(source)
  })

  it('asks to confirm before overwriting existing central store symlink', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# My instructions')
    const newSource = path.join(tmpDir, 'NEW.md')
    await fse.writeFile(newSource, '# New instructions')
    const linkPath = path.join(paths.instructionsDir, 'global.md')
    await fse.symlink(source, linkPath)

    const prompts = makeMockPrompts({
      'Scope (global or project):': 'global',
      'Source instructions file path:': newSource,
      'global.md already exists. Overwrite?': true,
    })

    await runInstructionsAdd(prompts, paths)

    expect(await fse.readlink(linkPath)).toBe(newSource)
  })

  it('aborts if user declines overwrite', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# My instructions')
    const linkPath = path.join(paths.instructionsDir, 'global.md')
    await fse.symlink(source, linkPath)

    const newSource = path.join(tmpDir, 'NEW.md')
    await fse.writeFile(newSource, 'x')

    const prompts = makeMockPrompts({
      'Scope (global or project):': 'global',
      'Source instructions file path:': newSource,
      'global.md already exists. Overwrite?': false,
    })

    await runInstructionsAdd(prompts, paths)

    expect(await fse.readlink(linkPath)).toBe(source) // unchanged
  })
})
