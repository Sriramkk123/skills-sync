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
      'Which skills to register? (↑↓ navigate, Space select, a = all, Enter confirm)': ['skill-a', 'skill-b'],
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

  it('removes only selected skill, preserves others and keeps source in config', async () => {
    const sourceDir = path.join(tmpDir, 'skills-src')
    await fse.ensureDir(sourceDir)
    for (const skill of ['skill-a', 'skill-b']) {
      await fse.ensureDir(path.join(sourceDir, skill))
      const link = path.join(paths.skillsDir, 'mylabel', skill)
      await fse.ensureDir(path.dirname(link))
      await fse.symlink(path.join(sourceDir, skill), link)
    }
    const config: Config = { ...DEFAULT_CONFIG, sources: [{ label: 'mylabel', path: sourceDir }] }
    await writeConfig(config, paths.configPath)

    const prompts = makeMockPrompts({
      'Which source to remove from?': 'mylabel',
      'Which skills to remove? (↑↓ navigate, Space select, a = all, Enter confirm)': ['skill-a'],
    })
    await runSkillRemove(prompts, paths)

    expect(await fse.pathExists(path.join(paths.skillsDir, 'mylabel', 'skill-a'))).toBe(false)
    expect(await fse.pathExists(path.join(paths.skillsDir, 'mylabel', 'skill-b'))).toBe(true)
    const updated = await readConfig(paths.configPath)
    expect(updated.sources.find(s => s.label === 'mylabel')).toBeDefined()
  })

  it('removes source from config when all skills removed via All', async () => {
    const sourceDir = path.join(tmpDir, 'skills-src2')
    await fse.ensureDir(sourceDir)
    const link = path.join(paths.skillsDir, 'mylabel2', 'skill-a')
    await fse.ensureDir(path.dirname(link))
    await fse.symlink(path.join(sourceDir, 'skill-a'), link)
    const config: Config = { ...DEFAULT_CONFIG, sources: [{ label: 'mylabel2', path: sourceDir }] }
    await writeConfig(config, paths.configPath)

    const prompts = makeMockPrompts({
      'Which source to remove from?': 'mylabel2',
      'Which skills to remove? (↑↓ navigate, Space select, a = all, Enter confirm)': ['skill-a'],
    })
    await runSkillRemove(prompts, paths)

    const updated = await readConfig(paths.configPath)
    expect(updated.sources.find(s => s.label === 'mylabel2')).toBeUndefined()
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
      syncs: [{ type: 'skill', ref: 'myskills/my-skill', destinations: [{ tool: 'antigravity', path: destLink, scope: 'project' }] }],
    }
    await writeConfig(config, paths.configPath)

    const prompts = makeMockPrompts({
      'Which source to remove from?': 'myskills',
      'Which skills to remove? (↑↓ navigate, Space select, a = all, Enter confirm)': ['skill-a'],
    })
    await runSkillRemove(prompts, paths)

    const updated = await readConfig(paths.configPath)
    expect(updated.syncs.length).toBe(1)
    expect(await fse.lstat(destLink).then(() => true).catch(() => false)).toBe(true)
  })
})

describe('runSkillAdd — label validation', () => {
  it('rejects label containing path traversal (../)', async () => {
    const sourceSkill = path.join(tmpDir, 'my-skill')
    await fse.ensureDir(sourceSkill)
    await fse.writeFile(path.join(sourceSkill, 'SKILL.md'), '')

    const logs: string[] = []
    const prompts = makeMockPrompts({
      'Source path (skill directory or parent directory containing skills):': sourceSkill,
      'Label for this source:': '../../.ssh',
    })

    await runSkillAdd(prompts, paths, (line) => logs.push(line))

    // No symlink should be created in skills dir
    expect(await fse.pathExists(paths.skillsDir)).toBe(true)
    // skills dir should be empty (no traversal happened)
    const entries = await fse.readdir(paths.skillsDir)
    expect(entries.length).toBe(0)
    expect(logs.some(l => l.includes('Invalid label'))).toBe(true)
  })

  it('rejects label containing forward slash', async () => {
    const sourceSkill = path.join(tmpDir, 'my-skill')
    await fse.ensureDir(sourceSkill)
    await fse.writeFile(path.join(sourceSkill, 'SKILL.md'), '')

    const logs: string[] = []
    const prompts = makeMockPrompts({
      'Source path (skill directory or parent directory containing skills):': sourceSkill,
      'Label for this source:': 'foo/bar',
    })

    await runSkillAdd(prompts, paths, (line) => logs.push(line))
    expect(logs.some(l => l.includes('Invalid label'))).toBe(true)
  })

  it('accepts valid labels (alphanumeric, hyphens, underscores, colons)', async () => {
    const sourceSkill = path.join(tmpDir, 'my-skill')
    await fse.ensureDir(sourceSkill)
    await fse.writeFile(path.join(sourceSkill, 'SKILL.md'), '')

    const prompts = makeMockPrompts({
      'Source path (skill directory or parent directory containing skills):': sourceSkill,
      'Label for this source:': 'my-org:skills_v2',
    })

    await runSkillAdd(prompts, paths)

    const linkPath = path.join(paths.skillsDir, 'my-org:skills_v2', 'my-skill')
    expect(await fse.pathExists(linkPath)).toBe(true)
  })

  it('rejects label that is only dots (..)', async () => {
    const sourceSkill = path.join(tmpDir, 'my-skill')
    await fse.ensureDir(sourceSkill)
    await fse.writeFile(path.join(sourceSkill, 'SKILL.md'), '')

    const logs: string[] = []
    const prompts = makeMockPrompts({
      'Source path (skill directory or parent directory containing skills):': sourceSkill,
      'Label for this source:': '..',
    })

    await runSkillAdd(prompts, paths, (line) => logs.push(line))
    expect(logs.some(l => l.includes('Invalid label'))).toBe(true)
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
