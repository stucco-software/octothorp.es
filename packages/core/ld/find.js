if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it.skip('Has some sort of usage API for getting values out of SPARQL Select responses.', () => {
    // TEST TK: Write it!
    expect('a').toStrictEqual('b')
  })
}

export const find = (bindings, value) => (term, id) => {
  let node = bindings.find(node => {
    return node.type.value === id
  })
  return node ? node[term].value : node
}
