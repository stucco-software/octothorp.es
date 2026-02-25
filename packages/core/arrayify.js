if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it('Returns the input if it is an array', () => {
    expect(arrayify(['a', 'b', 'c'])).toStrictEqual(['a', 'b', 'c'])
  })

  it('Returns the an array with the input if it is not an array', () => {
    expect(arrayify('a')).toStrictEqual(['a'])
  })

  it('Returns an empty array if input is null', () => {
    expect(arrayify(null)).toStrictEqual([])
  })
  
  it('Returns an empty array if input is undefined', () => {
    expect(arrayify(undefined)).toStrictEqual([])
  })
  
  it('Returns an empty array if input is false', () => {
    expect(arrayify(false)).toStrictEqual([])
  })
}

export const arrayify = target => target 
	? Array.isArray(target) 
		? target 
		: [target]
	: []

