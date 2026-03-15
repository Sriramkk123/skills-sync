import { withAllOption, resolveAll, ALL_SENTINEL } from '../../src/lib/select'

const choices = [
  { name: 'skill-a', value: 'a' },
  { name: 'skill-b', value: 'b' },
]

describe('withAllOption', () => {
  it('prepends All choice with sentinel value', () => {
    const result = withAllOption(choices)
    expect(result[0].value).toBe(ALL_SENTINEL)
    expect(result[0].name).toBe('All')
    expect(result.length).toBe(3)
  })

  it('does not mutate original choices', () => {
    withAllOption(choices)
    expect(choices.length).toBe(2)
  })
})

describe('resolveAll', () => {
  it('returns all values when __all__ is picked', () => {
    expect(resolveAll([ALL_SENTINEL], choices)).toEqual(['a', 'b'])
  })

  it('returns only picked values when All not selected', () => {
    expect(resolveAll(['a'], choices)).toEqual(['a'])
  })

  it('returns all values when All is mixed with specific picks', () => {
    expect(resolveAll([ALL_SENTINEL, 'a'], choices)).toEqual(['a', 'b'])
  })
})
