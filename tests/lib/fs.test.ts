import * as os from 'os'
import * as path from 'path'
import * as fse from 'fs-extra'
import {
  createSymlink,
  isManagedSymlink,
  isLiveSymlink,
  isBrokenSymlink,
  removeSymlink,
} from '../../src/lib/fs'

let tmpDir: string
let skillsyncHome: string

beforeEach(async () => {
  tmpDir = await fse.mkdtemp(path.join(os.tmpdir(), 'skillsync-test-'))
  skillsyncHome = path.join(tmpDir, '.skillsync')
  await fse.ensureDir(skillsyncHome)
})

afterEach(async () => {
  await fse.remove(tmpDir)
})

describe('createSymlink', () => {
  it('creates a symlink at linkPath pointing to target', async () => {
    const target = path.join(tmpDir, 'source-skill')
    const link = path.join(tmpDir, 'dest', 'skill')
    await fse.ensureDir(target)

    await createSymlink(target, link)

    const stat = await fse.lstat(link)
    expect(stat.isSymbolicLink()).toBe(true)
    expect(await fse.readlink(link)).toBe(target)
  })

  it('creates parent directories if they do not exist', async () => {
    const target = path.join(tmpDir, 'source')
    const link = path.join(tmpDir, 'deep', 'nested', 'link')
    await fse.ensureDir(target)

    await createSymlink(target, link)

    expect(await fse.pathExists(link)).toBe(true)
  })

  it('throws with EEXIST code when link path already exists', async () => {
    const target = path.join(tmpDir, 'source-skill')
    const link = path.join(tmpDir, 'dest', 'skill')
    await fse.ensureDir(target)
    await createSymlink(target, link)  // first call succeeds

    // second call on same path should throw EEXIST
    await expect(createSymlink(target, link)).rejects.toMatchObject({ code: 'EEXIST' })
  })
})

describe('isManagedSymlink', () => {
  it('returns true for symlink whose direct target is inside skillsync home', async () => {
    const centralStorePath = path.join(skillsyncHome, 'skills', 'claude', 'brainstorm')
    await fse.ensureDir(centralStorePath)
    const link = path.join(tmpDir, 'dest', 'brainstorm')
    await createSymlink(centralStorePath, link)

    expect(await isManagedSymlink(link, skillsyncHome)).toBe(true)
  })

  it('returns false for symlink pointing outside skillsync home', async () => {
    const target = path.join(tmpDir, 'external-skill')
    const link = path.join(tmpDir, 'dest', 'skill')
    await fse.ensureDir(target)
    await createSymlink(target, link)

    expect(await isManagedSymlink(link, skillsyncHome)).toBe(false)
  })

  it('returns false for a regular file', async () => {
    const file = path.join(tmpDir, 'regular.md')
    await fse.writeFile(file, 'content')

    expect(await isManagedSymlink(file, skillsyncHome)).toBe(false)
  })

  it('returns false for non-existent path', async () => {
    expect(await isManagedSymlink(path.join(tmpDir, 'ghost'), skillsyncHome)).toBe(false)
  })

  it('returns false for symlink pointing to a sibling directory with a similar name', async () => {
    const evilHome = skillsyncHome + '-evil'
    await fse.ensureDir(evilHome)
    const target = path.join(evilHome, 'malicious-skill')
    await fse.ensureDir(target)
    const link = path.join(tmpDir, 'dest', 'skill')
    await createSymlink(target, link)

    expect(await isManagedSymlink(link, skillsyncHome)).toBe(false)
  })

  it('returns true for symlink pointing exactly to skillsync home', async () => {
    const link = path.join(tmpDir, 'dest', 'home-link')
    await createSymlink(skillsyncHome, link)

    expect(await isManagedSymlink(link, skillsyncHome)).toBe(true)
  })
})

describe('isLiveSymlink', () => {
  it('returns true for symlink with existing target', async () => {
    const target = path.join(tmpDir, 'real')
    const link = path.join(tmpDir, 'link')
    await fse.ensureDir(target)
    await createSymlink(target, link)

    expect(await isLiveSymlink(link)).toBe(true)
  })

  it('returns false for broken symlink', async () => {
    const target = path.join(tmpDir, 'gone')
    const link = path.join(tmpDir, 'broken')
    await fse.symlink(target, link)

    expect(await isLiveSymlink(link)).toBe(false)
  })

  it('returns false for regular file', async () => {
    const file = path.join(tmpDir, 'file.txt')
    await fse.writeFile(file, 'x')
    expect(await isLiveSymlink(file)).toBe(false)
  })
})

describe('isBrokenSymlink', () => {
  it('returns true for symlink with missing target', async () => {
    const link = path.join(tmpDir, 'broken')
    await fse.symlink(path.join(tmpDir, 'missing'), link)

    expect(await isBrokenSymlink(link)).toBe(true)
  })

  it('returns false for live symlink', async () => {
    const target = path.join(tmpDir, 'real')
    const link = path.join(tmpDir, 'live')
    await fse.ensureDir(target)
    await createSymlink(target, link)

    expect(await isBrokenSymlink(link)).toBe(false)
  })

  it('returns false for non-existent path', async () => {
    expect(await isBrokenSymlink(path.join(tmpDir, 'none'))).toBe(false)
  })
})

describe('removeSymlink', () => {
  it('removes a symlink', async () => {
    const target = path.join(tmpDir, 'real')
    const link = path.join(tmpDir, 'link')
    await fse.ensureDir(target)
    await createSymlink(target, link)

    await removeSymlink(link)

    expect(await fse.pathExists(link)).toBe(false)
  })
})
