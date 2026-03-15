import * as os from 'os'
import * as path from 'path'
import * as fse from 'fs-extra'
import { runInit } from '../../src/commands/init'
import { makeConfigPaths, DEFAULT_CONFIG } from '../../src/lib/config'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fse.mkdtemp(path.join(os.tmpdir(), 'skillsync-init-'))
})

afterEach(async () => {
  await fse.remove(tmpDir)
})

describe('runInit', () => {
  it('creates skills dir, instructions dir, and config.json', async () => {
    const paths = makeConfigPaths(tmpDir)
    await runInit(paths)

    expect(await fse.pathExists(paths.skillsDir)).toBe(true)
    expect(await fse.pathExists(paths.instructionsDir)).toBe(true)
    expect(await fse.pathExists(paths.configPath)).toBe(true)
  })

  it('writes default config.json', async () => {
    const paths = makeConfigPaths(tmpDir)
    await runInit(paths)

    const config = await fse.readJson(paths.configPath)
    expect(config).toEqual(DEFAULT_CONFIG)
  })

  it('is idempotent — preserves existing config.json on re-run', async () => {
    const paths = makeConfigPaths(tmpDir)
    await runInit(paths)

    const modified = { ...DEFAULT_CONFIG, sources: [{ label: 'test', path: '/p' }] }
    await fse.writeJson(paths.configPath, modified)

    await runInit(paths)

    const config = await fse.readJson(paths.configPath)
    expect(config.sources[0].label).toBe('test')
  })

  it('creates missing directories even if config already exists', async () => {
    const paths = makeConfigPaths(tmpDir)
    await runInit(paths)
    await fse.remove(paths.skillsDir)

    await runInit(paths)

    expect(await fse.pathExists(paths.skillsDir)).toBe(true)
  })
})
