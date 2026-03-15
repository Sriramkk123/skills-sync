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
  it('creates central store symlink when given a file path directly', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# instructions')

    const prompts = makeMockPrompts({
      'Scope (global or project):': 'global',
      'Source tool:': 'claude-code',
      'Source path (directory or file):': source,
    })

    await runInstructionsAdd(prompts, paths)

    const linkPath = path.join(paths.instructionsDir, 'global.md')
    expect(await fse.readlink(linkPath)).toBe(source)
  })

  it('auto-finds the correct file in a directory based on source tool', async () => {
    const projectDir = path.join(tmpDir, 'my-project')
    await fse.ensureDir(projectDir)
    await fse.writeFile(path.join(projectDir, 'CLAUDE.md'), '# claude instructions')

    const prompts = makeMockPrompts({
      'Scope (global or project):': 'global',
      'Source tool:': 'claude-code',
      'Source path (directory or file):': projectDir,
    })

    await runInstructionsAdd(prompts, paths)

    const linkPath = path.join(paths.instructionsDir, 'global.md')
    expect(await fse.readlink(linkPath)).toBe(path.join(projectDir, 'CLAUDE.md'))
  })

  it('finds AGENTS.md when source tool is codex', async () => {
    const projectDir = path.join(tmpDir, 'codex-project')
    await fse.ensureDir(projectDir)
    await fse.writeFile(path.join(projectDir, 'AGENTS.md'), '# codex instructions')

    const prompts = makeMockPrompts({
      'Scope (global or project):': 'global',
      'Source tool:': 'codex',
      'Source path (directory or file):': projectDir,
    })

    await runInstructionsAdd(prompts, paths)

    const linkPath = path.join(paths.instructionsDir, 'global.md')
    expect(await fse.readlink(linkPath)).toBe(path.join(projectDir, 'AGENTS.md'))
  })

  it('errors when expected file is not found in directory', async () => {
    const projectDir = path.join(tmpDir, 'empty-project')
    await fse.ensureDir(projectDir)
    await fse.writeFile(path.join(projectDir, 'AGENTS.md'), '# wrong format')

    const logs: string[] = []
    const prompts = makeMockPrompts({
      'Scope (global or project):': 'global',
      'Source tool:': 'claude-code', // expects CLAUDE.md, but only AGENTS.md exists
      'Source path (directory or file):': projectDir,
    })

    await runInstructionsAdd(prompts, paths, (line) => logs.push(line))

    expect(logs.some(l => l.includes('CLAUDE.md not found'))).toBe(true)
    expect(await fse.pathExists(path.join(paths.instructionsDir, 'global.md'))).toBe(false)
  })

  it('errors if path does not exist', async () => {
    const logs: string[] = []
    const prompts = makeMockPrompts({
      'Scope (global or project):': 'global',
      'Source tool:': 'claude-code',
      'Source path (directory or file):': path.join(tmpDir, 'nonexistent'),
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
      'Source tool:': 'claude-code',
      'Source path (directory or file):': source,
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
      'Source tool:': 'claude-code',
      'Source path (directory or file):': newSource,
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
      'Source tool:': 'claude-code',
      'Source path (directory or file):': newSource,
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
