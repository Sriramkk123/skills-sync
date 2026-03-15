import * as os from 'os'
import * as path from 'path'
import * as fse from 'fs-extra'
import { runSync } from '../../src/commands/sync'
import { makeConfigPaths, readConfig, writeConfig, DEFAULT_CONFIG } from '../../src/lib/config'
import { makeMockPrompts } from '../../src/lib/prompts'

let tmpDir: string
let paths: ReturnType<typeof makeConfigPaths>

beforeEach(async () => {
  tmpDir = await fse.mkdtemp(path.join(os.tmpdir(), 'skillsync-sync-'))
  paths = makeConfigPaths(path.join(tmpDir, '.skillsync'))
  await fse.ensureDir(paths.skillsDir)
  await fse.ensureDir(paths.instructionsDir)
  await writeConfig(DEFAULT_CONFIG, paths.configPath)
})

afterEach(async () => {
  await fse.remove(tmpDir)
})

async function addSkillToStore(label: string, skillName: string) {
  const sourceDir = path.join(tmpDir, 'sources', label, skillName)
  await fse.ensureDir(sourceDir)
  const linkPath = path.join(paths.skillsDir, label, skillName)
  await fse.ensureDir(path.dirname(linkPath))
  await fse.symlink(sourceDir, linkPath)

  const config = await readConfig(paths.configPath)
  if (!config.sources.find(s => s.label === label)) {
    config.sources.push({ label, path: path.join(tmpDir, 'sources', label) })
    await writeConfig(config, paths.configPath)
  }
  return sourceDir
}

describe('runSync — skills', () => {
  it('creates destination symlink for a skill at a global tool path', async () => {
    await addSkillToStore('personal', 'brainstorm')
    const destDir = path.join(tmpDir, 'dest', '.claude', 'skills')
    await fse.ensureDir(destDir)

    const prompts = makeMockPrompts({
      'What to sync?': 'skills',
      'Which skills? (↑↓ navigate, Space select, a = all, Enter confirm)': ['personal/brainstorm'],
      'Which tool(s)? (↑↓ navigate, Space select, a = all, Enter confirm)': ['claude-code'],
      'Scope:': 'global',
      'Destination directory for Claude Code skills (global):': destDir,
    })

    await runSync(prompts, paths)

    const link = path.join(destDir, 'brainstorm')
    expect((await fse.lstat(link)).isSymbolicLink()).toBe(true)
    expect(await fse.readlink(link)).toBe(path.join(paths.skillsDir, 'personal', 'brainstorm'))
  })

  it('updates config.json syncs[] with destination', async () => {
    await addSkillToStore('personal', 'brainstorm')
    const destDir = path.join(tmpDir, 'dest', '.claude', 'skills')
    await fse.ensureDir(destDir)

    const prompts = makeMockPrompts({
      'What to sync?': 'skills',
      'Which skills? (↑↓ navigate, Space select, a = all, Enter confirm)': ['personal/brainstorm'],
      'Which tool(s)? (↑↓ navigate, Space select, a = all, Enter confirm)': ['claude-code'],
      'Scope:': 'global',
      'Destination directory for Claude Code skills (global):': destDir,
    })

    await runSync(prompts, paths)

    const config = await readConfig(paths.configPath)
    const syncEntry = config.syncs.find(s => s.ref === 'personal/brainstorm')
    expect(syncEntry).toBeDefined()
    expect(syncEntry!.destinations[0].tool).toBe('claude-code')
  })

  it('asks overwrite/skip when destination symlink already exists', async () => {
    await addSkillToStore('personal', 'brainstorm')
    const destDir = path.join(tmpDir, 'dest')
    const existingLink = path.join(destDir, 'brainstorm')
    await fse.ensureDir(destDir)
    await fse.symlink(path.join(tmpDir, 'old'), existingLink)

    const prompts = makeMockPrompts({
      'What to sync?': 'skills',
      'Which skills? (↑↓ navigate, Space select, a = all, Enter confirm)': ['personal/brainstorm'],
      'Which tool(s)? (↑↓ navigate, Space select, a = all, Enter confirm)': ['claude-code'],
      'Scope:': 'global',
      'Destination directory for Claude Code skills (global):': destDir,
      'brainstorm already exists at destination. Overwrite?': 'overwrite',
    })

    await runSync(prompts, paths)

    expect(await fse.readlink(existingLink)).toBe(
      path.join(paths.skillsDir, 'personal', 'brainstorm')
    )
  })

  it('warns and skips broken central store symlinks', async () => {
    const linkPath = path.join(paths.skillsDir, 'personal', 'broken')
    await fse.ensureDir(path.dirname(linkPath))
    await fse.symlink(path.join(tmpDir, 'nonexistent'), linkPath)

    const config = await readConfig(paths.configPath)
    config.sources.push({ label: 'personal', path: path.join(tmpDir, 'sources') })
    await writeConfig(config, paths.configPath)

    const destDir = path.join(tmpDir, 'dest')
    await fse.ensureDir(destDir)
    const logs: string[] = []

    const prompts = makeMockPrompts({
      'What to sync?': 'skills',
      'Which skills? (↑↓ navigate, Space select, a = all, Enter confirm)': ['personal/broken'],
      'Which tool(s)? (↑↓ navigate, Space select, a = all, Enter confirm)': ['claude-code'],
      'Scope:': 'global',
      'Destination directory for Claude Code skills (global):': destDir,
    })

    await runSync(prompts, paths, (line) => logs.push(line))
    expect(logs.some(l => l.includes('⚠️') || l.includes('broken'))).toBe(true)
  })

  it('creates destination directory when user confirms', async () => {
    await addSkillToStore('personal', 'brainstorm')
    const destDir = path.join(tmpDir, 'new-dest')
    // deliberately do NOT create destDir

    const prompts = makeMockPrompts({
      'What to sync?': 'skills',
      'Which skills? (↑↓ navigate, Space select, a = all, Enter confirm)': ['personal/brainstorm'],
      'Which tool(s)? (↑↓ navigate, Space select, a = all, Enter confirm)': ['claude-code'],
      'Scope:': 'global',
      'Destination directory for Claude Code skills (global):': destDir,
      [`${destDir} does not exist. Create it?`]: true,
    })

    const logs: string[] = []
    await runSync(prompts, paths, l => logs.push(l))

    expect(await fse.pathExists(destDir)).toBe(true)
    expect((await fse.lstat(path.join(destDir, 'brainstorm'))).isSymbolicLink()).toBe(true)
  })

  it('skips tool when user declines to create missing directory', async () => {
    await addSkillToStore('personal', 'brainstorm')
    const destDir = path.join(tmpDir, 'no-create')

    const prompts = makeMockPrompts({
      'What to sync?': 'skills',
      'Which skills? (↑↓ navigate, Space select, a = all, Enter confirm)': ['personal/brainstorm'],
      'Which tool(s)? (↑↓ navigate, Space select, a = all, Enter confirm)': ['claude-code'],
      'Scope:': 'global',
      'Destination directory for Claude Code skills (global):': destDir,
      [`${destDir} does not exist. Create it?`]: false,
    })

    const logs: string[] = []
    await runSync(prompts, paths, l => logs.push(l))

    expect(await fse.pathExists(destDir)).toBe(false)
    expect(logs.some(l => l.includes('Skipping'))).toBe(true)
  })

  it('syncs all skills when All is selected', async () => {
    await addSkillToStore('personal', 'brainstorm')
    await addSkillToStore('personal', 'debug')
    const destDir = path.join(tmpDir, 'dest-all')
    await fse.ensureDir(destDir)

    const prompts = makeMockPrompts({
      'What to sync?': 'skills',
      'Which skills? (↑↓ navigate, Space select, a = all, Enter confirm)': ['__all__'],
      'Which tool(s)? (↑↓ navigate, Space select, a = all, Enter confirm)': ['claude-code'],
      'Scope:': 'global',
      'Destination directory for Claude Code skills (global):': destDir,
    })

    await runSync(prompts, paths)

    expect((await fse.lstat(path.join(destDir, 'brainstorm'))).isSymbolicLink()).toBe(true)
    expect((await fse.lstat(path.join(destDir, 'debug'))).isSymbolicLink()).toBe(true)
  })
})

describe('runSync — instructions', () => {
  it('creates destination symlink for instructions at tool path', async () => {
    const sourceFile = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(sourceFile, '# My instructions')
    const instrLink = path.join(paths.instructionsDir, 'global.md')
    await fse.symlink(sourceFile, instrLink)

    const config = await readConfig(paths.configPath)
    config.instructions.global = sourceFile
    await writeConfig(config, paths.configPath)

    const destFile = path.join(tmpDir, 'dest', 'CLAUDE.md')
    await fse.ensureDir(path.dirname(destFile))

    const prompts = makeMockPrompts({
      'What to sync?': 'instructions',
      'Scope:': 'global',
      'Which tool(s)? (↑↓ navigate, Space select, a = all, Enter confirm)': ['claude-code'],
      'Destination for Claude Code instructions (global):': destFile,
    })

    await runSync(prompts, paths)

    expect((await fse.lstat(destFile)).isSymbolicLink()).toBe(true)
    expect(await fse.readlink(destFile)).toBe(instrLink)
  })

  it('warns before replacing non-managed existing file', async () => {
    const sourceFile = path.join(tmpDir, 'CLAUDE.md')
    await fse.writeFile(sourceFile, '# source')
    const instrLink = path.join(paths.instructionsDir, 'global.md')
    await fse.symlink(sourceFile, instrLink)

    const config = await readConfig(paths.configPath)
    config.instructions.global = sourceFile
    await writeConfig(config, paths.configPath)

    const destFile = path.join(tmpDir, 'dest', 'CLAUDE.md')
    await fse.ensureDir(path.dirname(destFile))
    await fse.writeFile(destFile, '# existing content')

    const prompts = makeMockPrompts({
      'What to sync?': 'instructions',
      'Scope:': 'global',
      'Which tool(s)? (↑↓ navigate, Space select, a = all, Enter confirm)': ['claude-code'],
      'Destination for Claude Code instructions (global):': destFile,
      'CLAUDE.md already exists and is not managed by skillsync. Replace with symlink?': true,
    })

    await runSync(prompts, paths)

    expect((await fse.lstat(destFile)).isSymbolicLink()).toBe(true)
  })
})
