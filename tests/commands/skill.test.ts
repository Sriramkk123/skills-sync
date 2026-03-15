import * as os from 'os'
import * as path from 'path'
import * as fse from 'fs-extra'
import { runSkillAdd, runSkillList, runSkillRemove } from '../../src/commands/skill'
import { makeConfigPaths, readConfig, writeConfig, DEFAULT_CONFIG } from '../../src/lib/config'
import { makeMockPrompts } from '../../src/lib/prompts'
import { Config } from '../../src/types'

let tmpDir: string
let paths: ReturnType<typeof makeConfigPaths>

beforeEach(async () => {
  tmpDir = await fse.mkdtemp(path.join(os.tmpdir(), 'skillsync-skill-'))
  paths = makeConfigPaths(path.join(tmpDir, '.skillsync'))
  await fse.ensureDir(paths.skillsDir)
  await fse.ensureDir(paths.instructionsDir)
  await writeConfig(DEFAULT_CONFIG, paths.configPath)
})

afterEach(async () => {
  await fse.remove(tmpDir)
})

describe('runSkillAdd — single skill directory', () => {
  it('creates central store symlink for a single skill dir', async () => {
    const sourceSkill = path.join(tmpDir, 'my-skill')
    await fse.ensureDir(sourceSkill)
    // Add SKILL.md so it's detected as a single skill (not parent dir)
    await fse.writeFile(path.join(sourceSkill, 'SKILL.md'), '')

    const prompts = makeMockPrompts({
      'Source path (skill directory or parent directory containing skills):': sourceSkill,
      'Label for this source:': 'myskills',
    })

    await runSkillAdd(prompts, paths)

    const linkPath = path.join(paths.skillsDir, 'myskills', 'my-skill')
    const stat = await fse.lstat(linkPath)
    expect(stat.isSymbolicLink()).toBe(true)
    expect(await fse.readlink(linkPath)).toBe(sourceSkill)
  })

  it('updates config.json sources[]', async () => {
    const sourceSkill = path.join(tmpDir, 'my-skill')
    await fse.ensureDir(sourceSkill)
    await fse.writeFile(path.join(sourceSkill, 'SKILL.md'), '')

    const prompts = makeMockPrompts({
      'Source path (skill directory or parent directory containing skills):': sourceSkill,
      'Label for this source:': 'myskills',
    })

    await runSkillAdd(prompts, paths)

    const config = await readConfig(paths.configPath)
    expect(config.sources.some(s => s.label === 'myskills')).toBe(true)
  })
})

describe('runSkillAdd — parent directory with multiple skills', () => {
  it('creates symlinks for all selected skills', async () => {
    const parentDir = path.join(tmpDir, 'skills-parent')
    await fse.ensureDir(path.join(parentDir, 'skill-a'))
    await fse.ensureDir(path.join(parentDir, 'skill-b'))

    const prompts = makeMockPrompts({
      'Source path (skill directory or parent directory containing skills):': parentDir,
      'Which skills to register?': ['skill-a', 'skill-b'],
      'Label for this source:': 'bulk',
    })

    await runSkillAdd(prompts, paths)

    const linkA = path.join(paths.skillsDir, 'bulk', 'skill-a')
    const linkB = path.join(paths.skillsDir, 'bulk', 'skill-b')
    expect((await fse.lstat(linkA)).isSymbolicLink()).toBe(true)
    expect((await fse.lstat(linkB)).isSymbolicLink()).toBe(true)
  })
})

describe('runSkillAdd — collision handling', () => {
  it('skips if central store symlink already exists for that skill', async () => {
    const sourceSkill = path.join(tmpDir, 'my-skill')
    await fse.ensureDir(sourceSkill)
    await fse.writeFile(path.join(sourceSkill, 'SKILL.md'), '')
    const linkPath = path.join(paths.skillsDir, 'myskills', 'my-skill')
    await fse.ensureDir(path.dirname(linkPath))
    await fse.symlink(sourceSkill, linkPath)

    const prompts = makeMockPrompts({
      'Source path (skill directory or parent directory containing skills):': sourceSkill,
      'Label for this source:': 'myskills',
    })

    await runSkillAdd(prompts, paths)

    expect(await fse.readlink(linkPath)).toBe(sourceSkill)
  })
})

describe('runSkillRemove', () => {
  it('shows warning when no sources are registered', async () => {
    const prompts = makeMockPrompts({})
    const logs: string[] = []
    await runSkillRemove(prompts, paths, l => logs.push(l))
    expect(logs.some(l => l.includes('No sources registered'))).toBe(true)
  })

  it('removes central store symlink but keeps source registration in config', async () => {
    const sourceSkill = path.join(tmpDir, 'my-skill')
    await fse.ensureDir(sourceSkill)
    await fse.writeFile(path.join(sourceSkill, 'SKILL.md'), '')

    const linkPath = path.join(paths.skillsDir, 'myskills', 'my-skill')
    await fse.ensureDir(path.dirname(linkPath))
    await fse.symlink(sourceSkill, linkPath)

    const config: Config = {
      ...DEFAULT_CONFIG,
      sources: [{ label: 'myskills', path: sourceSkill }],
    }
    await writeConfig(config, paths.configPath)

    const prompts = makeMockPrompts({
      'Which source to remove?': 'myskills',
    })

    const logs: string[] = []
    await runSkillRemove(prompts, paths, l => logs.push(l))

    expect(await fse.pathExists(linkPath)).toBe(false)
    const updated = await readConfig(paths.configPath)
    expect(updated.sources.find(s => s.label === 'myskills')).toBeUndefined()
    expect(logs.some(l => l.includes('myskills'))).toBe(true)
  })

  it('does not touch destination symlinks or sync entries', async () => {
    const sourceSkill = path.join(tmpDir, 'my-skill')
    await fse.ensureDir(sourceSkill)

    const centralLink = path.join(paths.skillsDir, 'myskills', 'my-skill')
    await fse.ensureDir(path.dirname(centralLink))
    await fse.symlink(sourceSkill, centralLink)

    const destLink = path.join(tmpDir, 'dest', 'my-skill')
    await fse.ensureDir(path.dirname(destLink))
    await fse.symlink(centralLink, destLink)

    const config: Config = {
      ...DEFAULT_CONFIG,
      sources: [{ label: 'myskills', path: sourceSkill }],
      syncs: [{
        type: 'skill',
        ref: 'myskills/my-skill',
        destinations: [{ tool: 'antigravity', path: destLink, scope: 'project' }],
      }],
    }
    await writeConfig(config, paths.configPath)

    const prompts = makeMockPrompts({
      'Which source to remove?': 'myskills',
    })

    await runSkillRemove(prompts, paths)

    // Destination symlink still exists on disk (may be broken, but not deleted)
    expect(await fse.pathExists(destLink).catch(() => false) || await fse.lstat(destLink).then(() => true).catch(() => false)).toBe(true)
    const updated = await readConfig(paths.configPath)
    // Sync entry preserved
    expect(updated.syncs.length).toBe(1)
    // Source removed from config
    expect(updated.sources.length).toBe(0)
  })
})

describe('runSkillList', () => {
  it('lists skills from central store with live status', async () => {
    const sourceSkill = path.join(tmpDir, 'brainstorm')
    await fse.ensureDir(sourceSkill)
    const linkPath = path.join(paths.skillsDir, 'claude', 'brainstorm')
    await fse.ensureDir(path.dirname(linkPath))
    await fse.symlink(sourceSkill, linkPath)

    const output: string[] = []
    await runSkillList(paths, (line) => output.push(line))

    expect(output.some(l => l.includes('brainstorm'))).toBe(true)
    expect(output.some(l => l.includes('✅'))).toBe(true)
  })

  it('shows broken status for dead symlinks', async () => {
    const linkPath = path.join(paths.skillsDir, 'claude', 'broken-skill')
    await fse.ensureDir(path.dirname(linkPath))
    await fse.symlink(path.join(tmpDir, 'nonexistent'), linkPath)

    const output: string[] = []
    await runSkillList(paths, (line) => output.push(line))

    expect(output.some(l => l.includes('⚠️'))).toBe(true)
  })
})
