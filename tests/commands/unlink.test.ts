import * as os from 'os'
import * as path from 'path'
import * as fse from 'fs-extra'
import { runUnlink } from '../../src/commands/unlink'
import { makeConfigPaths, writeConfig, readConfig, DEFAULT_CONFIG } from '../../src/lib/config'
import { makeMockPrompts } from '../../src/lib/prompts'
import { Config } from '../../src/types'

let tmpDir: string
let paths: ReturnType<typeof makeConfigPaths>

beforeEach(async () => {
  tmpDir = await fse.mkdtemp(path.join(os.tmpdir(), 'skillsync-unlink-'))
  paths = makeConfigPaths(path.join(tmpDir, '.skillsync'))
  await fse.ensureDir(paths.skillsDir)
  await fse.ensureDir(paths.instructionsDir)
})

afterEach(async () => {
  await fse.remove(tmpDir)
})

describe('runUnlink — no destinations', () => {
  it('shows warning when no destinations exist', async () => {
    await writeConfig(DEFAULT_CONFIG, paths.configPath)
    const prompts = makeMockPrompts({})
    const logs: string[] = []
    await runUnlink(prompts, paths, l => logs.push(l))
    expect(logs.some(l => l.includes('No synced destinations'))).toBe(true)
  })
})

describe('runUnlink — skills', () => {
  it('removes selected skill symlink and updates config', async () => {
    const source = path.join(tmpDir, 'brainstorm')
    await fse.ensureDir(source)
    const destDir = path.join(tmpDir, 'dest')
    await fse.ensureDir(destDir)
    const destLink = path.join(destDir, 'brainstorm')
    await fse.symlink(source, destLink)

    const config: Config = {
      ...DEFAULT_CONFIG,
      syncs: [{
        type: 'skill',
        ref: 'personal/brainstorm',
        destinations: [{ tool: 'claude-code', path: destLink, scope: 'global' }],
      }],
    }
    await writeConfig(config, paths.configPath)

    const prompts = makeMockPrompts({
      'Which directory to unlink from?': destDir,
      'Which skills to unlink? (↑↓ navigate, Space select, a = all, Enter confirm)': [destLink],
    })

    await runUnlink(prompts, paths)

    expect(await fse.pathExists(destLink)).toBe(false)
    const updated = await readConfig(paths.configPath)
    expect(updated.syncs.find(s => s.ref === 'personal/brainstorm')).toBeUndefined()
  })

  it('removes all skills in directory when All is selected', async () => {
    const source = path.join(tmpDir, 'src')
    await fse.ensureDir(source)
    const destDir = path.join(tmpDir, 'dest2')
    await fse.ensureDir(destDir)
    const linkA = path.join(destDir, 'brainstorm')
    const linkB = path.join(destDir, 'debug')
    await fse.symlink(source, linkA)
    await fse.symlink(source, linkB)

    const config: Config = {
      ...DEFAULT_CONFIG,
      syncs: [
        { type: 'skill', ref: 'p/brainstorm', destinations: [{ tool: 'claude-code', path: linkA, scope: 'global' }] },
        { type: 'skill', ref: 'p/debug',      destinations: [{ tool: 'claude-code', path: linkB, scope: 'global' }] },
      ],
    }
    await writeConfig(config, paths.configPath)

    const prompts = makeMockPrompts({
      'Which directory to unlink from?': destDir,
      'Which skills to unlink? (↑↓ navigate, Space select, a = all, Enter confirm)': [linkA, linkB],
    })

    await runUnlink(prompts, paths)

    expect(await fse.pathExists(linkA)).toBe(false)
    expect(await fse.pathExists(linkB)).toBe(false)
    const updated = await readConfig(paths.configPath)
    expect(updated.syncs.length).toBe(0)
  })

  it('removes only selected skill, keeps other in same directory', async () => {
    const source = path.join(tmpDir, 'src3')
    await fse.ensureDir(source)
    const destDir = path.join(tmpDir, 'dest3')
    await fse.ensureDir(destDir)
    const linkA = path.join(destDir, 'brainstorm')
    const linkB = path.join(destDir, 'debug')
    await fse.symlink(source, linkA)
    await fse.symlink(source, linkB)

    const config: Config = {
      ...DEFAULT_CONFIG,
      syncs: [
        { type: 'skill', ref: 'p/brainstorm', destinations: [{ tool: 'claude-code', path: linkA, scope: 'global' }] },
        { type: 'skill', ref: 'p/debug',      destinations: [{ tool: 'claude-code', path: linkB, scope: 'global' }] },
      ],
    }
    await writeConfig(config, paths.configPath)

    const prompts = makeMockPrompts({
      'Which directory to unlink from?': destDir,
      'Which skills to unlink? (↑↓ navigate, Space select, a = all, Enter confirm)': [linkA],
    })

    await runUnlink(prompts, paths)

    expect(await fse.pathExists(linkA)).toBe(false)
    expect(await fse.pathExists(linkB)).toBe(true)
    const updated = await readConfig(paths.configPath)
    expect(updated.syncs.length).toBe(1)
    expect(updated.syncs[0].ref).toBe('p/debug')
  })
})

describe('runUnlink — instructions', () => {
  it('refuses to delete non-managed instruction file', async () => {
    const destFile = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(destFile, '# hand-written')

    const config: Config = {
      ...DEFAULT_CONFIG,
      syncs: [{
        type: 'instructions',
        ref: 'global',
        destinations: [{ tool: 'claude-code', path: destFile, scope: 'global' }],
      }],
    }
    await writeConfig(config, paths.configPath)

    const prompts = makeMockPrompts({
      'Which directory to unlink from?': path.dirname(destFile),
      'Which instructions to unlink? (↑↓ navigate, Space select, a = all, Enter confirm)': [destFile],
    })

    const logs: string[] = []
    await runUnlink(prompts, paths, l => logs.push(l))

    expect(await fse.pathExists(destFile)).toBe(true)
    expect(logs.some(l => l.includes('not managed'))).toBe(true)
  })

  it('removes managed instruction symlink and updates config', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# source')
    const instrLink = path.join(paths.instructionsDir, 'global.md')
    await fse.symlink(source, instrLink)

    const destFile = path.join(tmpDir, 'dest', 'CLAUDE.md')
    await fse.ensureDir(path.dirname(destFile))
    await fse.symlink(instrLink, destFile)

    const config: Config = {
      ...DEFAULT_CONFIG,
      syncs: [{
        type: 'instructions',
        ref: 'global',
        destinations: [{ tool: 'claude-code', path: destFile, scope: 'global' }],
      }],
    }
    await writeConfig(config, paths.configPath)

    const prompts = makeMockPrompts({
      'Which directory to unlink from?': path.dirname(destFile),
      'Which instructions to unlink? (↑↓ navigate, Space select, a = all, Enter confirm)': [destFile],
    })

    await runUnlink(prompts, paths)

    expect(await fse.pathExists(destFile)).toBe(false)
    const updated = await readConfig(paths.configPath)
    expect(updated.syncs.length).toBe(0)
  })
})
