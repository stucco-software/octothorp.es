export const find = (bindings, value) => (term, id) => {
  let node = bindings.find(node => {
    return node.type.value === id
  })
  return node ? node[term].value : node
}
