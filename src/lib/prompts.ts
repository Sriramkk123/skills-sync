export interface Choice {
  name: string
  value: string
}

export interface PromptAdapter {
  input(message: string, defaultValue?: string): Promise<string>
  select(message: string, choices: Choice[]): Promise<string>
  multiselect(message: string, choices: Choice[]): Promise<string[]>
  confirm(message: string, defaultValue?: boolean): Promise<boolean>
}

export const defaultPrompts: PromptAdapter = {
  async input(message, defaultValue) {
    const { input } = await import('@inquirer/prompts')
    return input({ message, default: defaultValue })
  },
  async select(message, choices) {
    const { select } = await import('@inquirer/prompts')
    return select({ message, choices })
  },
  async multiselect(message, choices) {
    const { checkbox } = await import('@inquirer/prompts')
    return checkbox({ message, choices })
  },
  async confirm(message, defaultValue = false) {
    const { confirm } = await import('@inquirer/prompts')
    return confirm({ message, default: defaultValue })
  },
}

/**
 * Build a mock PromptAdapter that returns pre-configured answers keyed by prompt message.
 */
export function makeMockPrompts(answers: Record<string, string | string[] | boolean>): PromptAdapter {
  const getAnswer = (message: string) => {
    if (!(message in answers)) throw new Error(`Unexpected prompt: "${message}"`)
    return answers[message]
  }
  return {
    async input(message) { return getAnswer(message) as string },
    async select(message) { return getAnswer(message) as string },
    async multiselect(message) { return getAnswer(message) as string[] },
    async confirm(message) { return getAnswer(message) as boolean },
  }
}
