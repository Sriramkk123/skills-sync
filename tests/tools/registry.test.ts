import * as os from 'os'
import * as path from 'path'
import { TOOLS, getToolById, getSkillsDir, getInstructionDestPath } from '../../src/tools/registry'

describe('TOOLS registry', () => {
  it('contains all 4 MVP tools', () => {
    const ids = TOOLS.map(t => t.id)
    expect(ids).toContain('claude-code')
    expect(ids).toContain('antigravity')
    expect(ids).toContain('codex')
    expect(ids).toContain('opencode')
  })
})

describe('getToolById', () => {
  it('returns the tool for a known id', () => {
    const tool = getToolById('claude-code')
    expect(tool).toBeDefined()
    expect(tool!.name).toBe('Claude Code')
  })

  it('returns undefined for unknown id', () => {
    expect(getToolById('unknown')).toBeUndefined()
  })
})

describe('getSkillsDir', () => {
  it('returns global skills dir for claude-code', () => {
    const tool = getToolById('claude-code')!
    const dir = getSkillsDir(tool, 'global')
    expect(dir).toBe(path.join(os.homedir(), '.claude', 'skills'))
  })

  it('returns project skills dir joined to projectDir', () => {
    const tool = getToolById('claude-code')!
    const dir = getSkillsDir(tool, 'project', '/my/project')
    expect(dir).toBe('/my/project/.claude/skills')
  })

  it('antigravity project uses .agent/skills (singular)', () => {
    const tool = getToolById('antigravity')!
    const dir = getSkillsDir(tool, 'project', '/p')
    expect(dir).toBe('/p/.agent/skills')
  })

  it('codex project uses .agents/skills (plural)', () => {
    const tool = getToolById('codex')!
    const dir = getSkillsDir(tool, 'project', '/p')
    expect(dir).toBe('/p/.agents/skills')
  })
})

describe('getInstructionDestPath', () => {
  it('claude-code global returns ~/.claude/CLAUDE.md', () => {
    const tool = getToolById('claude-code')!
    const p = getInstructionDestPath(tool, 'global')
    expect(p).toBe(path.join(os.homedir(), '.claude', 'CLAUDE.md'))
  })

  it('antigravity global returns ~/.gemini/GEMINI.md', () => {
    const tool = getToolById('antigravity')!
    const p = getInstructionDestPath(tool, 'global')
    expect(p).toBe(path.join(os.homedir(), '.gemini', 'GEMINI.md'))
  })

  it('antigravity project returns AGENTS.md', () => {
    const tool = getToolById('antigravity')!
    const p = getInstructionDestPath(tool, 'project', '/p')
    expect(p).toBe('/p/AGENTS.md')
  })

  it('claude-code project returns CLAUDE.md', () => {
    const tool = getToolById('claude-code')!
    const p = getInstructionDestPath(tool, 'project', '/p')
    expect(p).toBe('/p/CLAUDE.md')
  })
})
