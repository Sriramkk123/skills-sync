import * as os from 'os'
import * as path from 'path'
import { Scope, ToolDefinition } from '../types'

export const TOOLS: ToolDefinition[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    globalSkillsDir: path.join(os.homedir(), '.claude', 'skills'),
    projectSkillsDir: '.claude/skills',
    globalInstructionFile: 'CLAUDE.md',
    projectInstructionFile: 'CLAUDE.md',
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    globalSkillsDir: path.join(os.homedir(), '.gemini', 'antigravity', 'skills'),
    projectSkillsDir: '.agent/skills',
    globalInstructionFile: 'GEMINI.md',
    projectInstructionFile: 'AGENTS.md',
    usesCopy: true,
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    globalSkillsDir: path.join(os.homedir(), '.codex', 'skills'),
    projectSkillsDir: '.agents/skills',
    globalInstructionFile: 'AGENTS.md',
    projectInstructionFile: 'AGENTS.md',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    globalSkillsDir: path.join(os.homedir(), '.config', 'opencode', 'skills'),
    projectSkillsDir: '.opencode/skills',
    globalInstructionFile: 'AGENTS.md',
    projectInstructionFile: 'AGENTS.md',
  },
]

export function getToolById(id: string): ToolDefinition | undefined {
  return TOOLS.find(t => t.id === id)
}

export function getSkillsDir(tool: ToolDefinition, scope: Scope, projectDir?: string): string {
  if (scope === 'global') return tool.globalSkillsDir
  return path.join(projectDir || '.', tool.projectSkillsDir)
}

export function getInstructionDestPath(tool: ToolDefinition, scope: Scope, projectDir?: string): string {
  const filename = scope === 'global' ? tool.globalInstructionFile : tool.projectInstructionFile
  if (scope === 'global') {
    const globalDirs: Record<string, string> = {
      'claude-code': path.join(os.homedir(), '.claude'),
      'antigravity': path.join(os.homedir(), '.gemini'),
      'codex': path.join(os.homedir(), '.codex'),
      'opencode': path.join(os.homedir(), '.config', 'opencode'),
    }
    return path.join(globalDirs[tool.id], filename)
  }
  return path.join(projectDir || '.', filename)
}
