import { arrayify } from '../arrayify.js'
let p = 'octo:octothorpes'

// Private Function Test
if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it.skip('Gets triple object from an HTML Node', () => {
    // TEST TK: Feed it an HTML Document and test for array of triples.
    expect('a').toStrictEqual('b')
  })
}
const getO = (node, instance) => {
  let o = node.getAttribute('href') || node.textContent.trim()
  let url
  try {
    url = new URL(o)
  } catch (e) {
    o.startsWith('/')
      ? url = new URL(`${instance}${o.replace('/', '')}`)
      : url = new URL(`${instance}~/${o}`)
  }
  return url.href
}

// Private Function Test
if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it.skip('Finds triple statements within an HTML Document', () => {
    // TEST TK: Feed it an HTML Document and test for array of triples. 
    expect('a').toStrictEqual('b')
  })
}
const getStatementsAboutOtherSubjects = ({doc, s, instance}) => {
  const otherLinks = [...doc.querySelectorAll('[about]')]
  const linkSubjects = otherLinks.map(node => node.getAttribute('about'))
  const uniqueSubjects = [...new Set(linkSubjects)]
  let triples = uniqueSubjects
    .map(s => {
      let nodes = [...doc.querySelectorAll(`[about="${s}"]`)]
      return nodes
        .map(node => {
          return `<${s}> ${node.getAttribute('rel')} <${getO(node, instance)}> .`
        })
    })
    .flat()
  let assertions = uniqueSubjects
    .map(o => `<${s}> octo:asserts <${o}>`)
  return [...triples, ...assertions]
}

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it.skip('Finds triple statements within an HTML Document', () => {
    // TEST TK: Feed it an HTML Document and test for array of triples. 
    expect('a').toStrictEqual('b')
  })
}
const getStatementsAboutThisSubject = ({doc, s, instance}) => {

  const subjectNodes = [...doc.querySelectorAll(`[rel="${p}"]`)]
  let triples = subjectNodes
    .map(node => `<${s}> ${p} <${getO(node, instance)}> .`)
  return triples
}

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it.skip('Finds triple statements within an HTML Document', () => {
    // TEST TK: Feed it an HTML Document and test for array of triples. 
    expect('a').toStrictEqual('b')
  })
}
export const rdfa2triples = ({doc, s, instance}) => {
  let thisTriples = getStatementsAboutThisSubject({doc, s, instance})
  let otherTriples = getStatementsAboutOtherSubjects({doc, s, instance})
  return [...thisTriples, ...otherTriples]
}
