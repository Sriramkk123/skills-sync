# Development

## Prerequisites

- Node.js >= 20
- pnpm

## Setup

```bash
pnpm install
```

## Running locally

Use `pnpm dev` to run the CLI directly via `ts-node` without building:

```bash
pnpm dev -- <command>

# Examples
pnpm dev -- init
pnpm dev -- skill add
pnpm dev -- sync
pnpm dev -- status
```

Alternatively, build once and run the compiled output:

```bash
pnpm build
node dist/index.js <command>
```

Or link the package globally so `skillsync` works as a real command:

```bash
pnpm build
npm link
skillsync status
```

## Tests

```bash
pnpm test           # run all tests
pnpm test:watch     # watch mode
```

Tests use real temp directories — no mocking of `fs`. Each test creates a fresh `~/.skillsync`-equivalent under `os.tmpdir()` and cleans up after itself.

## Project structure

```
src/
  index.ts              CLI entry point, commander wiring
  types.ts              Shared TypeScript types
  tools/registry.ts     Tool definitions (paths, instruction filenames per tool)
  lib/config.ts         Config read/write, path helpers
  lib/fs.ts             Symlink helpers (createSymlink, isLiveSymlink, etc.)
  lib/prompts.ts        PromptAdapter interface and mock factory for tests
  commands/
    init.ts             skillsync init
    skill.ts            skillsync skill add/list/remove
    instructions.ts     skillsync instructions add/remove
    sync.ts             skillsync sync
    status.ts           skillsync status
    unlink.ts           skillsync unlink
tests/
  commands/             One test file per command
  lib/                  Tests for config and fs helpers
  tools/                Tests for registry
```

## Adding a new tool

1. Add an entry to `TOOLS` in `src/tools/registry.ts`
2. Verify `getInstructionDestPath` returns the correct path for it
3. Add test cases in `tests/tools/registry.test.ts`

## Adding a new command

1. Create `src/commands/<name>.ts` — accept `(prompts, paths, log)` as injectable params
2. Wire it into `src/index.ts` with the `guardInit()` guard
3. Add tests in `tests/commands/<name>.test.ts` using `makeMockPrompts` and `makeConfigPaths(tmpDir)`
