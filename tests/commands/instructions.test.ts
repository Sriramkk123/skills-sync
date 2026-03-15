import * as os from 'os'
import * as path from 'path'
import * as fse from 'fs-extra'
import { runInstructionsAdd, runInstructionsRemove } from '../../src/commands/instructions'
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

describe('runInstructionsAdd — source resolution', () => {
  it('creates central store symlink from exact file path', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# instructions')

    const prompts = makeMockPrompts({
      'Scope (global or project):': 'global',
      'Source file path (e.g. /path/to/CLAUDE.md):': source,
    })

    await runInstructionsAdd(prompts, paths)

    const linkPath = path.join(paths.instructionsDir, 'global.md')
    expect(await fse.readlink(linkPath)).toBe(source)
  })

  it('works with AGENTS.md path directly', async () => {
    const source = path.join(tmpDir, 'AGENTS.md')
    await fse.writeFile(source, '# codex instructions')

    const prompts = makeMockPrompts({
      'Scope (global or project):': 'global',
      'Source file path (e.g. /path/to/CLAUDE.md):': source,
    })

    await runInstructionsAdd(prompts, paths)

    const linkPath = path.join(paths.instructionsDir, 'global.md')
    expect(await fse.readlink(linkPath)).toBe(source)
  })

  it('errors if a directory is given instead of a file', async () => {
    const dir = path.join(tmpDir, 'some-dir')
    await fse.ensureDir(dir)

    const logs: string[] = []
    const prompts = makeMockPrompts({
      'Scope (global or project):': 'global',
      'Source file path (e.g. /path/to/CLAUDE.md):': dir,
    })

    await runInstructionsAdd(prompts, paths, (line) => logs.push(line))

    expect(logs.some(l => l.includes('Expected a file'))).toBe(true)
    expect(await fse.pathExists(path.join(paths.instructionsDir, 'global.md'))).toBe(false)
  })

  it('errors if path does not exist', async () => {
    const logs: string[] = []
    const prompts = makeMockPrompts({
      'Scope (global or project):': 'global',
      'Source file path (e.g. /path/to/CLAUDE.md):': path.join(tmpDir, 'nonexistent.md'),
    })

    await runInstructionsAdd(prompts, paths, (line) => logs.push(line))

    expect(logs.some(l => l.includes('does not exist'))).toBe(true)
  })
})

describe('runInstructionsAdd — registration only', () => {
  it('saves source to config.json and does not create any destination symlinks', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# instructions')

    const prompts = makeMockPrompts({
      'Scope (global or project):': 'global',
      'Source file path (e.g. /path/to/CLAUDE.md):': source,
    })

    await runInstructionsAdd(prompts, paths)

    const config = await readConfig(paths.configPath)
    expect(config.instructions.global).toBe(source)
    expect(config.syncs.length).toBe(0)
  })

  it('asks to confirm before overwriting existing central store entry', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# original')
    const newSource = path.join(tmpDir, 'NEW.md')
    await fse.writeFile(newSource, '# new')
    const linkPath = path.join(paths.instructionsDir, 'global.md')
    await fse.symlink(source, linkPath)

    const prompts = makeMockPrompts({
      'Scope (global or project):': 'global',
      'Source file path (e.g. /path/to/CLAUDE.md):': newSource,
      'global.md already exists. Overwrite?': true,
    })

    await runInstructionsAdd(prompts, paths)

    expect(await fse.readlink(linkPath)).toBe(newSource)
  })

  it('aborts if user declines overwrite', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# instructions')
    const linkPath = path.join(paths.instructionsDir, 'global.md')
    await fse.symlink(source, linkPath)
    const newSource = path.join(tmpDir, 'NEW.md')
    await fse.writeFile(newSource, 'x')

    const prompts = makeMockPrompts({
      'Scope (global or project):': 'global',
      'Source file path (e.g. /path/to/CLAUDE.md):': newSource,
      'global.md already exists. Overwrite?': false,
    })

    await runInstructionsAdd(prompts, paths)

    expect(await fse.readlink(linkPath)).toBe(source) // unchanged
  })
})

describe('runInstructionsRemove', () => {
  it('shows warning when no instructions are registered', async () => {
    const logs: string[] = []
    const prompts = makeMockPrompts({})

    await runInstructionsRemove(prompts, paths, (line) => logs.push(line))

    expect(logs.some(l => l.includes('No instructions registered'))).toBe(true)
  })

  it('removes central store symlink and clears config', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# instructions')
    const instrLink = path.join(paths.instructionsDir, 'global.md')
    await fse.symlink(source, instrLink)
    await writeConfig({ ...DEFAULT_CONFIG, instructions: { global: source } }, paths.configPath)

    const prompts = makeMockPrompts({
      'Which instructions to remove?': 'global',
      'Remove global instructions and 0 destination symlink(s)?': true,
    })

    await runInstructionsRemove(prompts, paths)

    expect(await fse.pathExists(instrLink)).toBe(false)
    const config = await readConfig(paths.configPath)
    expect(config.instructions.global).toBeUndefined()
  })

  it('also removes destination symlinks', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# instructions')
    const instrLink = path.join(paths.instructionsDir, 'global.md')
    await fse.symlink(source, instrLink)

    const destDir = path.join(tmpDir, 'dest')
    await fse.ensureDir(destDir)
    const destFile = path.join(destDir, 'CLAUDE.md')
    await fse.symlink(instrLink, destFile)

    await writeConfig({
      ...DEFAULT_CONFIG,
      instructions: { global: source },
      syncs: [{
        type: 'instructions',
        ref: 'global',
        destinations: [{ tool: 'claude-code', path: destFile, scope: 'global' }],
      }],
    }, paths.configPath)

    const prompts = makeMockPrompts({
      'Which instructions to remove?': 'global',
      'Remove global instructions and 1 destination symlink(s)?': true,
    })

    await runInstructionsRemove(prompts, paths)

    expect(await fse.pathExists(destFile)).toBe(false)
    expect(await fse.pathExists(instrLink)).toBe(false)
    const config = await readConfig(paths.configPath)
    expect(config.instructions.global).toBeUndefined()
    expect(config.syncs.length).toBe(0)
  })

  it('aborts when user declines confirmation', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# instructions')
    const instrLink = path.join(paths.instructionsDir, 'global.md')
    await fse.symlink(source, instrLink)
    await writeConfig({ ...DEFAULT_CONFIG, instructions: { global: source } }, paths.configPath)

    const prompts = makeMockPrompts({
      'Which instructions to remove?': 'global',
      'Remove global instructions and 0 destination symlink(s)?': false,
    })

    await runInstructionsRemove(prompts, paths)

    expect(await fse.pathExists(instrLink)).toBe(true) // unchanged
    const config = await readConfig(paths.configPath)
    expect(config.instructions.global).toBe(source) // unchanged
  })
})
