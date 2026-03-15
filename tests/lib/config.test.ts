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
    const config = { ...DEFAULT_CONFIG, instructions: { global: '/my/CLAUDE.md' } }
    await writeConfig(config, configPath)
    const read = await readConfig(configPath)
    expect(read.instructions.global).toBe('/my/CLAUDE.md')
  })
})
