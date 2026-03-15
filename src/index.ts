#!/usr/bin/env node
const [major] = process.versions.node.split('.').map(Number)
if (major < 20) {
  console.error(`skillsync requires Node.js >= 20 (current: ${process.versions.node}). Run: nvm use 25.2.1`)
  process.exit(1)
}

import { Command } from 'commander'
import chalk from 'chalk'
import { runInit } from './commands/init'
import { runSkillAdd, runSkillList, runSkillRemove } from './commands/skill'
import { runInstructionsAdd } from './commands/instructions'
import { runSync } from './commands/sync'
import { runStatus } from './commands/status'
import { runUnlink } from './commands/unlink'
import { defaultPrompts } from './lib/prompts'
import { isInitialized, makeConfigPaths } from './lib/config'

const program = new Command()

program
  .name('skillsync')
  .description('Sync AI coding skills across Claude Code, Antigravity, Codex CLI, and OpenCode')
  .version('1.0.0')

program
  .command('init')
  .description('Initialize the skillsync central store at ~/.skillsync/')
  .action(async () => {
    try {
      await runInit()
    } catch (e: any) {
      console.error(chalk.red(e.message))
      process.exit(1)
    }
  })

const skillCmd = program.command('skill').description('Manage skills')

skillCmd
  .command('add')
  .description('Register a skill source in the central store')
  .action(async () => {
    try {
      await guardInit()
      await runSkillAdd(defaultPrompts)
    } catch (e: any) {
      console.error(chalk.red(e.message))
      process.exit(1)
    }
  })

skillCmd
  .command('list')
  .description('List all registered skills')
  .action(async () => {
    try {
      await guardInit()
      await runSkillList()
    } catch (e: any) {
      console.error(chalk.red(e.message))
      process.exit(1)
    }
  })

skillCmd
  .command('remove')
  .description('Remove a registered skill source and its central store symlinks')
  .action(async () => {
    try {
      await guardInit()
      await runSkillRemove(defaultPrompts)
    } catch (e: any) {
      console.error(chalk.red(e.message))
      process.exit(1)
    }
  })

const instrCmd = program.command('instructions').description('Manage instructions')

instrCmd
  .command('add')
  .description('Register an instructions source in the central store')
  .action(async () => {
    try {
      await guardInit()
      await runInstructionsAdd(defaultPrompts)
    } catch (e: any) {
      console.error(chalk.red(e.message))
      process.exit(1)
    }
  })

program
  .command('sync')
  .description('Distribute registered skills/instructions to tool destinations')
  .action(async () => {
    try {
      await guardInit()
      await runSync(defaultPrompts)
    } catch (e: any) {
      console.error(chalk.red(e.message))
      process.exit(1)
    }
  })

program
  .command('status')
  .description('Show all registered skills/instructions and sync destinations')
  .action(async () => {
    try {
      await guardInit()
      await runStatus()
    } catch (e: any) {
      console.error(chalk.red(e.message))
      process.exit(1)
    }
  })

program
  .command('unlink')
  .description('Remove a destination symlink')
  .action(async () => {
    try {
      await guardInit()
      await runUnlink(defaultPrompts)
    } catch (e: any) {
      console.error(chalk.red(e.message))
      process.exit(1)
    }
  })

async function guardInit(): Promise<void> {
  if (!await isInitialized()) {
    console.error(chalk.red('❌ Not initialized. Run: skillsync init'))
    process.exit(1)
  }
}

program.parse(process.argv)
