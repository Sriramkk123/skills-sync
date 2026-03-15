---
name: add-tool
description: Add a new AI tool to the skillsync registry (src/tools/registry.ts) with correct paths and instruction filenames, then add tests for it
---

Add a new tool to the skillsync registry following the existing pattern.

## Steps

1. Open `src/tools/registry.ts` and add a new entry to the `TOOLS` array with:
   - `id` — lowercase, hyphenated (e.g. `cursor`)
   - `name` — display name
   - `globalSkillsDir` — absolute path using `path.join(os.homedir(), ...)`
   - `projectSkillsDir` — relative path string (e.g. `.cursor/skills`)
   - `globalInstructionFile` — filename (e.g. `CURSOR.md`)
   - `projectInstructionFile` — filename (e.g. `AGENTS.md`)

2. If the tool needs a non-standard global instruction directory, add it to the `globalDirs` record in `getInstructionDestPath`.

3. Add test cases in `tests/tools/registry.test.ts`:
   - Verify the tool ID is in `TOOLS`
   - Verify `getSkillsDir` returns correct global and project paths
   - Verify `getInstructionDestPath` returns correct global and project paths

4. Run `pnpm test tests/tools/registry.test.ts` — all tests must pass.

## Reference

Consult `docs/superpowers/specs/2026-03-15-skills-sync-design.md` for the MVP tool list and any post-MVP tools that were deferred.
