export const ALL_SENTINEL = '__all__'

export function withAllOption<T extends { name: string; value: string }>(
  choices: T[]
): Array<{ name: string; value: string }> {
  return [{ name: 'All', value: ALL_SENTINEL }, ...choices]
}

export function resolveAll(picked: string[], choices: Array<{ value: string }>): string[] {
  if (picked.includes(ALL_SENTINEL)) return choices.map(c => c.value)
  return picked
}
