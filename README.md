# skillsync

Sync AI coding skills and instructions across Claude Code, Antigravity, Codex CLI, and OpenCode via symlinks. Edit once — all tools see the change instantly.

## How it works

skillsync maintains a central store at `~/.skillsync/`. Skills and instructions are registered there as symlinks pointing back to your source files. When you sync, destination symlinks are created in each tool's expected location pointing into the central store. No files are copied — it's symlinks all the way down.

```
Your source file/dir
  └─→ ~/.skillsync/skills/label/skillname   (central store symlink)
        └─→ ~/.claude/skills/skillname      (destination symlink)
        └─→ ~/.codex/skills/skillname       (destination symlink)
```

## Installation

```bash
npm install -g skills-sync
```

Or run directly with pnpm:

```bash
pnpm dev
```

## Quick start

```bash
skillsync init          # create ~/.skillsync/ on first use
skillsync skill add     # register a skill source
skillsync sync          # distribute to tools
skillsync status        # check what's registered and synced
```

## Commands

### `skillsync init`

Creates the central store at `~/.skillsync/`. Run this once before anything else.

---

### `skillsync skill add`

Register a skill source. You'll be prompted for:

- **Source path** — a single skill directory (must contain `SKILL.md`) or a parent directory containing multiple skill subdirectories
- **Label** — a name for this source (e.g. `personal`, `work`)
- If a parent directory is given, you can pick which skills to register from it

Skills are stored as symlinks in `~/.skillsync/skills/<label>/<skillname>`.

### `skillsync skill list`

Lists all registered skills and whether their central store symlinks are live or broken.

### `skillsync skill remove`

Remove one or more registered skills. Also removes any destination symlinks that were created during sync.

---

### `skillsync instructions add`

Register an instruction file (e.g. a `CLAUDE.md` or `AGENTS.md`). You'll be prompted for:

- **Source path** — the instruction file to register
- **Label** — a name for this source (e.g. `work`, `personal`)

The file is symlinked into `~/.skillsync/instructions/<label>.md`.

### `skillsync instructions remove`

Remove a registered instruction and its destination symlinks.

---

### `skillsync sync`

Distribute registered skills or instructions to tool destinations. You'll be prompted for:

- What to sync: **Skills**, **Instructions**, or **Both**
- Which items to sync
- Which tools to target (Claude Code, Antigravity, Codex CLI, OpenCode)
- **Scope**: `global` (user-wide) or `project` (specific directory)
- Destination paths (pre-filled with sensible defaults)

Destination symlinks point into the central store, so editing the source is immediately reflected everywhere.

---

### `skillsync status`

Shows all registered skills and instructions with their sync health:

```
Skills
  personal/brainstorm   ✅ source live
    → ~/.claude/skills/brainstorm  [claude-code · global]  ✅
  personal/debug   ✅ source live
    → (not synced yet)

Instructions
  work   ✅ source live
    → ~/.claude/CLAUDE.md  [claude-code · global]  ✅
```

---

### `skillsync unlink`

Remove a single destination symlink (without removing the skill/instruction registration or the central store entry).

## Supported tools

| Tool | Skills | Instructions |
|------|--------|-------------|
| Claude Code | `~/.claude/skills/` | `~/.claude/CLAUDE.md` |
| Antigravity | `~/.gemini/antigravity/skills/` | `~/.gemini/GEMINI.md` |
| Codex CLI | `~/.codex/skills/` | `~/.codex/AGENTS.md` |
| OpenCode | `~/.config/opencode/skills/` | `~/.config/opencode/AGENTS.md` |

> **Note:** Antigravity does not support symlinks — skills are copied instead of linked. Edits at the destination won't reflect back to the source.

## Notes

- Labels must contain only letters, numbers, hyphens, underscores, colons, dots, or `@`
- Requires Node.js >= 20
