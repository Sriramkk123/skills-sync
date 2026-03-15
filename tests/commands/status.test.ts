import * as os from 'os'
import * as path from 'path'
import * as fse from 'fs-extra'
import { runStatus } from '../../src/commands/status'
import { makeConfigPaths, writeConfig, DEFAULT_CONFIG } from '../../src/lib/config'
import { Config } from '../../src/types'

let tmpDir: string
let paths: ReturnType<typeof makeConfigPaths>

beforeEach(async () => {
  tmpDir = await fse.mkdtemp(path.join(os.tmpdir(), 'skillsync-status-'))
  paths = makeConfigPaths(path.join(tmpDir, '.skillsync'))
  await fse.ensureDir(paths.skillsDir)
  await fse.ensureDir(paths.instructionsDir)
})

afterEach(async () => {
  await fse.remove(tmpDir)
})

describe('runStatus', () => {
  it('shows skills with their destinations and health', async () => {
    const source = path.join(tmpDir, 'brainstorm')
    await fse.ensureDir(source)
    const centralLink = path.join(paths.skillsDir, 'personal', 'brainstorm')
    await fse.ensureDir(path.dirname(centralLink))
    await fse.symlink(source, centralLink)

    const destLink = path.join(tmpDir, 'dest', 'brainstorm')
    await fse.ensureDir(path.dirname(destLink))
    await fse.symlink(centralLink, destLink)

    const config: Config = {
      ...DEFAULT_CONFIG,
      sources: [{ label: 'personal', path: path.join(tmpDir, 'sources') }],
      syncs: [{
        type: 'skill',
        ref: 'personal/brainstorm',
        destinations: [{ tool: 'claude-code', path: destLink, scope: 'global' }],
      }],
    }
    await writeConfig(config, paths.configPath)

    const output: string[] = []
    await runStatus(paths, (line) => output.push(line))

    expect(output.some(l => l.includes('brainstorm'))).toBe(true)
    expect(output.some(l => l.includes('✅'))).toBe(true)
    expect(output.some(l => l.includes('claude-code'))).toBe(true)
  })

  it('shows ⚠️ for broken central store symlinks', async () => {
    const brokenLink = path.join(paths.skillsDir, 'personal', 'broken-skill')
    await fse.ensureDir(path.dirname(brokenLink))
    await fse.symlink(path.join(tmpDir, 'nonexistent'), brokenLink)

    const config: Config = {
      ...DEFAULT_CONFIG,
      sources: [{ label: 'personal', path: tmpDir }],
      syncs: [{
        type: 'skill',
        ref: 'personal/broken-skill',
        destinations: [],
      }],
    }
    await writeConfig(config, paths.configPath)

    const output: string[] = []
    await runStatus(paths, (line) => output.push(line))

    expect(output.some(l => l.includes('⚠️'))).toBe(true)
  })

  it('shows (not synced yet) for skills registered but never synced', async () => {
    const source = path.join(tmpDir, 'my-skill')
    await fse.ensureDir(source)
    const centralLink = path.join(paths.skillsDir, 'personal', 'my-skill')
    await fse.ensureDir(path.dirname(centralLink))
    await fse.symlink(source, centralLink)

    // No entry in config.syncs — skill was registered but never synced
    await writeConfig(DEFAULT_CONFIG, paths.configPath)

    const output: string[] = []
    await runStatus(paths, (line) => output.push(line))

    expect(output.some(l => l.includes('my-skill'))).toBe(true)
    expect(output.some(l => l.includes('not synced yet'))).toBe(true)
  })

  it('shows instructions with their destinations', async () => {
    const source = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(source, '# instructions')
    const instrLink = path.join(paths.instructionsDir, 'global.md')
    await fse.symlink(source, instrLink)

    const destFile = path.join(tmpDir, 'dest', 'CLAUDE.md')
    await fse.ensureDir(path.dirname(destFile))
    await fse.symlink(instrLink, destFile)

    const config: Config = {
      ...DEFAULT_CONFIG,
      instructions: { global: source },
      syncs: [{
        type: 'instructions',
        ref: 'global',
        destinations: [{ tool: 'claude-code', path: destFile, scope: 'global' }],
      }],
    }
    await writeConfig(config, paths.configPath)

    const output: string[] = []
    await runStatus(paths, (line) => output.push(line))

    expect(output.some(l => l.includes('global'))).toBe(true)
    expect(output.some(l => l.includes('CLAUDE.md') || l.includes('claude-code'))).toBe(true)
  })
})
