import * as os from 'os'
import * as path from 'path'
import * as fse from 'fs-extra'
import { runInstructionsAdd, runInstructionsRemove } from '../../src/commands/instructions'
import { makeConfigPaths, readConfig, writeConfig, DEFAULT_CONFIG } from '../../src/lib/config'
import { makeMockPrompts } from '../../src/lib/prompts'
import { Config } from '../../src/types'

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
      'Label for this instructions source:': 'my-claude',
            'Source file path (e.g. /path/to/CLAUDE.md):': source,
    })

    await runInstructionsAdd(prompts, paths)

    const linkPath = path.join(paths.instructionsDir, 'my-claude.md')
    expect(await fse.readlink(linkPath)).toBe(source)
  })

  it('works with AGENTS.md path directly', async () => {
    const source = path.join(tmpDir, 'AGENTS.md')
    await fse.writeFile(source, '# codex instructions')

    const prompts = makeMockPrompts({
      'Label for this instructions source:': 'my-agents',
            'Source file path (e.g. /path/to/CLAUDE.md):': source,
    })

    await runInstructionsAdd(prompts, paths)

    const linkPath = path.join(paths.instructionsDir, 'my-agents.md')
    expect(await fse.readlink(linkPath)).toBe(source)
  })

  it('errors if a directory is given instead of a file', async () => {
    const dir = path.join(tmpDir, 'some-dir')
    await fse.ensureDir(dir)

    const logs: string[] = []
    const prompts = makeMockPrompts({
      'Label for this instructions source:': 'my-label',
            'Source file path (e.g. /path/to/CLAUDE.md):': dir,
    })

    await runInstructionsAdd(prompts, paths, (line) => logs.push(line))

    expect(logs.some(l => l.includes('Expected a file'))).toBe(true)
    expect(await fse.pathExists(path.join(paths.instructionsDir, 'my-label.md'))).toBe(false)
  })

  it('errors if path does not exist', async () => {
    const logs: string[] = []
    const prompts = makeMockPrompts({
      'Label for this instructions source:': 'my-label',
            'Source file path (e.g. /path/to/CLAUDE.md):': path.join(tmpDir, 'nonexistent.md'),
    })

    await runInstructionsAdd(prompts, paths, (line) => logs.push(line))

    expect(logs.some(l => l.includes('does not exist'))).toBe(true)
  })

  it('rejects invalid label', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# instructions')

    const logs: string[] = []
    const prompts = makeMockPrompts({
      'Label for this instructions source:': '../evil',
            'Source file path (e.g. /path/to/CLAUDE.md):': source,
    })

    await runInstructionsAdd(prompts, paths, (line) => logs.push(line))

    expect(logs.some(l => l.includes('Invalid label'))).toBe(true)
  })
})

describe('runInstructionsAdd — registration', () => {
  it('saves label, scope, and path to config.instructions[]', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# instructions')

    const prompts = makeMockPrompts({
      'Label for this instructions source:': 'work',
            'Source file path (e.g. /path/to/CLAUDE.md):': source,
    })

    await runInstructionsAdd(prompts, paths)

    const config = await readConfig(paths.configPath)
    expect(config.instructions).toHaveLength(1)
    expect(config.instructions[0]).toEqual({ label: 'work', path: source })
    expect(config.syncs.length).toBe(0)
  })

  it('allows multiple entries with different labels', async () => {
    const sourceA = path.join(tmpDir, 'CLAUDE.md')
    const sourceB = path.join(tmpDir, 'AGENTS.md')
    await fse.writeFile(sourceA, '# claude')
    await fse.writeFile(sourceB, '# agents')

    await runInstructionsAdd(makeMockPrompts({
      'Label for this instructions source:': 'claude-global',
            'Source file path (e.g. /path/to/CLAUDE.md):': sourceA,
    }), paths)

    await runInstructionsAdd(makeMockPrompts({
      'Label for this instructions source:': 'agents-global',
            'Source file path (e.g. /path/to/CLAUDE.md):': sourceB,
    }), paths)

    const config = await readConfig(paths.configPath)
    expect(config.instructions).toHaveLength(2)
    expect(config.instructions.map(i => i.label)).toEqual(['claude-global', 'agents-global'])
  })

  it('asks to confirm before overwriting existing label', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# original')
    const newSource = path.join(tmpDir, 'NEW.md')
    await fse.writeFile(newSource, '# new')

    await runInstructionsAdd(makeMockPrompts({
      'Label for this instructions source:': 'my-instr',
            'Source file path (e.g. /path/to/CLAUDE.md):': source,
    }), paths)

    await runInstructionsAdd(makeMockPrompts({
      'Label for this instructions source:': 'my-instr',
            'Source file path (e.g. /path/to/CLAUDE.md):': newSource,
      'Label "my-instr" already registered. Overwrite?': true,
    }), paths)

    const config = await readConfig(paths.configPath)
    expect(config.instructions).toHaveLength(1)
    expect(config.instructions[0].path).toBe(newSource)
  })

  it('aborts if user declines overwrite', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# instructions')
    const newSource = path.join(tmpDir, 'NEW.md')
    await fse.writeFile(newSource, 'x')

    await runInstructionsAdd(makeMockPrompts({
      'Label for this instructions source:': 'my-instr',
            'Source file path (e.g. /path/to/CLAUDE.md):': source,
    }), paths)

    await runInstructionsAdd(makeMockPrompts({
      'Label for this instructions source:': 'my-instr',
            'Source file path (e.g. /path/to/CLAUDE.md):': newSource,
      'Label "my-instr" already registered. Overwrite?': false,
    }), paths)

    const config = await readConfig(paths.configPath)
    expect(config.instructions[0].path).toBe(source) // unchanged
  })
})

describe('runInstructionsRemove', () => {
  it('shows warning when no instructions are registered', async () => {
    const logs: string[] = []
    await runInstructionsRemove(makeMockPrompts({}), paths, (line) => logs.push(line))
    expect(logs.some(l => l.includes('No instructions registered'))).toBe(true)
  })

  it('removes central store symlink and clears config', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# instructions')
    const instrLink = path.join(paths.instructionsDir, 'work.md')
    await fse.symlink(source, instrLink)
    await writeConfig({
      ...DEFAULT_CONFIG,
      instructions: [{ label: 'work', path: source }],
    }, paths.configPath)

    await runInstructionsRemove(makeMockPrompts({
      'Which instructions to remove?': 'work',
      'Remove "work" and 0 destination symlink(s)?': true,
    }), paths)

    expect(await fse.pathExists(instrLink)).toBe(false)
    const config = await readConfig(paths.configPath)
    expect(config.instructions).toHaveLength(0)
  })

  it('also removes destination symlinks', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# instructions')
    const instrLink = path.join(paths.instructionsDir, 'work.md')
    await fse.symlink(source, instrLink)

    const destDir = path.join(tmpDir, 'dest')
    await fse.ensureDir(destDir)
    const destFile = path.join(destDir, 'CLAUDE.md')
    await fse.symlink(instrLink, destFile)

    await writeConfig({
      ...DEFAULT_CONFIG,
      instructions: [{ label: 'work', path: source }],
      syncs: [{
        type: 'instructions',
        ref: 'work',
        destinations: [{ tool: 'claude-code', path: destFile, scope: 'global' }],
      }],
    }, paths.configPath)

    await runInstructionsRemove(makeMockPrompts({
      'Which instructions to remove?': 'work',
      'Remove "work" and 1 destination symlink(s)?': true,
    }), paths)

    expect(await fse.pathExists(destFile)).toBe(false)
    expect(await fse.pathExists(instrLink)).toBe(false)
    const config = await readConfig(paths.configPath)
    expect(config.instructions).toHaveLength(0)
    expect(config.syncs.length).toBe(0)
  })

  it('aborts when user declines confirmation', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# instructions')
    const instrLink = path.join(paths.instructionsDir, 'work.md')
    await fse.symlink(source, instrLink)
    await writeConfig({
      ...DEFAULT_CONFIG,
      instructions: [{ label: 'work', path: source }],
    }, paths.configPath)

    await runInstructionsRemove(makeMockPrompts({
      'Which instructions to remove?': 'work',
      'Remove "work" and 0 destination symlink(s)?': false,
    }), paths)

    expect(await fse.pathExists(instrLink)).toBe(true)
    const config = await readConfig(paths.configPath)
    expect(config.instructions).toHaveLength(1)
  })
})
