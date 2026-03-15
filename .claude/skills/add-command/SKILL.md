---
name: add-command
description: Scaffold a new skillsync CLI command (src/commands + tests + CLI wiring) following the injectable params pattern
---

Add a new command to the skillsync CLI following the established pattern.

## Steps

1. **Create `src/commands/<name>.ts`**
   - Export `run<Name>(prompts: PromptAdapter, paths: ConfigPaths, log = console.log): Promise<void>`
   - Use `readConfig(paths.configPath)` / `writeConfig(config, paths.configPath)` — never hardcode paths
   - Use `isManagedSymlink(path, paths.home)` for safety checks

2. **Wire into `src/index.ts`**
   - Add a `program.command(...)` with description and `.action(async () => { await guardInit(); await run<Name>(defaultPrompts) })`

3. **Write tests in `tests/commands/<name>.test.ts`**
   - Setup: `makeConfigPaths(path.join(tmpDir, '.skillsync'))`, write `DEFAULT_CONFIG`, `ensureDir` skill/instruction dirs
   - Use `makeMockPrompts({ 'Exact prompt message:': answer })` — message must match exactly
   - Use injectable `log` collector: `const logs: string[] = []; await run<Name>(prompts, paths, l => logs.push(l))`
   - Cover: happy path, each error case from the spec error table, idempotency where applicable

4. **Run `pnpm test` — all 55+ tests must pass**

## Key conventions

- `fse.pathExists` returns false for broken symlinks — also check `isBrokenSymlink` when guarding overwrites
- `makeMockPrompts` throws on unexpected prompt messages — test will fail loudly if prompts drift
- Never use `jest.mock('os')` — use `makeConfigPaths(tmpDir)` instead
