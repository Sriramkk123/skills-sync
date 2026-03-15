export type Scope = 'global' | 'project'
export type SyncType = 'skill' | 'instructions'

export interface Source {
  label: string
  path: string
}

export interface SyncDestination {
  tool: string
  path: string
  scope: Scope
}

export interface SyncEntry {
  type: SyncType
  ref: string
  destinations: SyncDestination[]
}

export interface InstructionSource {
  label: string
  path: string
}

export interface Config {
  sources: Source[]
  instructions: InstructionSource[]
  syncs: SyncEntry[]
}

export interface ToolDefinition {
  id: string
  name: string
  globalSkillsDir: string
  projectSkillsDir: string
  globalInstructionFile: string
  projectInstructionFile: string
  /** Uses file copies instead of symlinks — edits at destination won't reflect back at source */
  usesCopy?: boolean
}
