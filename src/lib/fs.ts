import * as fse from 'fs-extra'
import * as path from 'path'

export async function createSymlink(target: string, linkPath: string): Promise<void> {
  await fse.ensureDir(path.dirname(linkPath))
  await fse.symlink(target, linkPath)
}

export async function isManagedSymlink(linkPath: string, skillsyncHome: string): Promise<boolean> {
  try {
    const stat = await fse.lstat(linkPath)
    if (!stat.isSymbolicLink()) return false
    // Read one level only — destination symlinks point into skillsyncHome,
    // which is itself a symlink. realpath() would follow the full chain and
    // land outside skillsyncHome. readlink() reads only one hop.
    const target = await fse.readlink(linkPath)
    const absTarget = path.resolve(path.dirname(linkPath), target)
    return absTarget.startsWith(skillsyncHome + path.sep) || absTarget === skillsyncHome
  } catch {
    return false
  }
}

export async function isLiveSymlink(linkPath: string): Promise<boolean> {
  try {
    const lstat = await fse.lstat(linkPath)
    if (!lstat.isSymbolicLink()) return false
    await fse.stat(linkPath) // follows symlink — throws if broken
    return true
  } catch {
    return false
  }
}

export async function isBrokenSymlink(linkPath: string): Promise<boolean> {
  try {
    const lstat = await fse.lstat(linkPath)
    if (!lstat.isSymbolicLink()) return false
    try {
      await fse.stat(linkPath)
      return false
    } catch {
      return true
    }
  } catch {
    return false
  }
}

export async function removeSymlink(linkPath: string): Promise<void> {
  await fse.remove(linkPath)
}
