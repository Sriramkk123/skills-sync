import * as os from 'os'
import * as path from 'path'
import * as fse from 'fs-extra'
import { makeConfigPaths, readConfig, writeConfig, DEFAULT_CONFIG } from '../../src/lib/config'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fse.mkdtemp(path.join(os.tmpdir(), 'skillsync-config-'))
})

afterEach(async () => {
  await fse.remove(tmpDir)
})

describe('makeConfigPaths', () => {
  it('returns correct paths relative to given home', () => {
    const paths = makeConfigPaths('/custom/home')
    expect(paths.configPath).toBe('/custom/home/config.json')
    expect(paths.skillsDir).toBe('/custom/home/skills')
    expect(paths.instructionsDir).toBe('/custom/home/instructions')
  })
})

describe('readConfig', () => {
  it('throws if config.json does not exist', async () => {
    const configPath = path.join(tmpDir, 'config.json')
    await expect(readConfig(configPath)).rejects.toThrow('skillsync not initialized')
  })

  it('reads a valid config.json', async () => {
    const configPath = path.join(tmpDir, 'config.json')
    await fse.writeJson(configPath, DEFAULT_CONFIG)
    const config = await readConfig(configPath)
    expect(config.sources).toEqual([])
    expect(config.syncs).toEqual([])
  })

  it('throws if config.json has missing sources array', async () => {
    const configPath = path.join(tmpDir, 'config.json')
    await fse.writeJson(configPath, { instructions: {}, syncs: [] })
    await expect(readConfig(configPath)).rejects.toThrow('Invalid config')
  })

  it('throws if config.json sources entry is missing required fields', async () => {
    const configPath = path.join(tmpDir, 'config.json')
    await fse.writeJson(configPath, {
      sources: [{ label: 'test' }],  // missing 'path' field
      instructions: {},
      syncs: [],
    })
    await expect(readConfig(configPath)).rejects.toThrow('Invalid config')
  })

  it('throws if config.json has wrong types', async () => {
    const configPath = path.join(tmpDir, 'config.json')
    await fse.writeJson(configPath, { sources: 'not-an-array', instructions: {}, syncs: [] })
    await expect(readConfig(configPath)).rejects.toThrow('Invalid config')
  })

  it('throws if syncs entry has invalid type field', async () => {
    const configPath = path.join(tmpDir, 'config.json')
    await fse.writeJson(configPath, {
      sources: [],
      instructions: {},
      syncs: [{ type: 'invalid', ref: 'x', destinations: [] }],
    })
    await expect(readConfig(configPath)).rejects.toThrow('Invalid config')
  })

  it('throws if destination entry is missing required fields', async () => {
    const configPath = path.join(tmpDir, 'config.json')
    await fse.writeJson(configPath, {
      sources: [],
      instructions: {},
      syncs: [{ type: 'skill', ref: 'x', destinations: [{ tool: 'claude-code' }] }],
    })
    await expect(readConfig(configPath)).rejects.toThrow('Invalid config')
  })

  it('throws if destination scope is not "global" or "project"', async () => {
    const configPath = path.join(tmpDir, 'config.json')
    await fse.writeJson(configPath, {
      sources: [],
      instructions: {},
      syncs: [{ type: 'skill', ref: 'x', destinations: [{ tool: 'claude-code', path: '/p', scope: 'invalid' }] }],
    })
    await expect(readConfig(configPath)).rejects.toThrow('Invalid config')
  })
})

describe('writeConfig', () => {
  it('writes config to disk as pretty JSON', async () => {
    const configPath = path.join(tmpDir, 'config.json')
    await writeConfig({ ...DEFAULT_CONFIG, sources: [{ label: 'test', path: '/p' }] }, configPath)
    const raw = await fse.readFile(configPath, 'utf8')
    const parsed = JSON.parse(raw)
    expect(parsed.sources[0].label).toBe('test')
  })

  it('readConfig after writeConfig round-trips correctly', async () => {
    const configPath = path.join(tmpDir, 'config.json')
    const instr = { label: 'work', scope: 'global' as const, path: '/my/CLAUDE.md' }
    const config = { ...DEFAULT_CONFIG, instructions: [instr] }
    await writeConfig(config, configPath)
    const read = await readConfig(configPath)
    expect(read.instructions[0].path).toBe('/my/CLAUDE.md')
    expect(read.instructions[0].label).toBe('work')
  })
})
