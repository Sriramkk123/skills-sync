/**
 * Reserved sentinel value that must never be used as an actual skill value.
 * Using this as a real skill value will cause unexpected behavior in skill selection.
 */
export const ALL_SENTINEL = '__all__'

/**
 * Prepends an "All" option to the choice list.
 *
 * Precondition: `choices` must be non-empty. Behavior with empty choices is supported
 * but callers should ensure choices are populated before calling.
 *
 * @param choices Non-empty array of choice objects with name and value
 * @returns New array with "All" sentinel prepended
 */
export function withAllOption(
  choices: Array<{ name: string; value: string }>
): Array<{ name: string; value: string }> {
  return [{ name: 'All', value: ALL_SENTINEL }, ...choices]
}

export function resolveAll(picked: string[], choices: Array<{ value: string }>): string[] {
  if (picked.includes(ALL_SENTINEL)) return choices.map(c => c.value)
  return picked
}
