# skillsync

CLI tool that syncs AI coding skills and instructions across Claude Code, Antigravity, Codex CLI, and OpenCode via symlinks.

## Commands

```bash
pnpm test          # run full test suite (jest)
pnpm test:watch    # watch mode
pnpm build         # compile TypeScript → dist/
pnpm dev           # run CLI directly via ts-node
```

## Architecture

- **Central store**: `~/.skillsync/` holds symlinks to original skill dirs and instruction files
- **Destinations**: each tool's expected path symlinks back into the central store
- **No file copies**: all sync is symlink-only — edit the source once, all tools see it instantly

```
src/
  index.ts              — CLI entry, commander wiring
  types.ts              — shared TypeScript types
  tools/registry.ts     — tool definitions (id, name, paths, instruction filenames per scope)
  lib/config.ts         — makeConfigPaths(), readConfig(), writeConfig(), DEFAULT_CONFIG
  lib/fs.ts             — createSymlink, isManagedSymlink, isLiveSymlink, isBrokenSymlink
  lib/prompts.ts        — PromptAdapter interface, defaultPrompts, makeMockPrompts()
  commands/             — one file per command (init, skill, instructions, sync, status, unlink)
```

## Key Conventions

- **Testability via injection**: commands take `paths` (from `makeConfigPaths(tmpDir)`) and `log` as parameters — never hardcode `~/.skillsync` in command logic
- **No fs mocking**: tests use real temp directories (`os.tmpdir()`), never `jest.mock('fs')`
- **makeMockPrompts**: test prompts by passing `Record<message, answer>` — throws on unexpected prompt messages
- **Async fs helpers**: `isLiveSymlink`, `isBrokenSymlink`, `isManagedSymlink` are all async — use `await`
- **isManagedSymlink** uses `readlink()` (one hop), not `realpath()` — intentional, see spec
- **chalk@4**: pinned to v4 (CommonJS) — do NOT upgrade to v5 (ESM-only, breaks Jest)
- **@inquirer/prompts**: ESM-only — `defaultPrompts` uses dynamic `import()` inside method bodies

## Adding a New Tool

1. Add entry to `TOOLS` array in `src/tools/registry.ts`
2. Verify `getInstructionDestPath` returns correct path for the new tool
3. Add test cases in `tests/tools/registry.test.ts`

## Adding a New Command

1. Create `src/commands/<name>.ts` — accept `(prompts, paths, log)` as injectable params
2. Wire into `src/index.ts` with `guardInit()` guard
3. Add tests in `tests/commands/<name>.test.ts` using `makeMockPrompts` and `makeConfigPaths(tmpDir)`
