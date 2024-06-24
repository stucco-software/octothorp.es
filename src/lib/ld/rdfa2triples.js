import { arrayify } from '$lib/arrayify.js'
import { instance } from '$env/static/private'
let p = 'octo:octothorpes'

// Private Function Test
if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it.skip('Gets triple object from an HTML Node', () => {
    // TEST TK: Feed it an HTML Document and test for array of triples. 
    expect('a').toStrictEqual('b')
  })
}
const getO = (node) => {
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
const getStatementsAboutOtherSubjects = ({doc, s}) => {
  const otherLinks = [...doc.querySelectorAll('[about]')]
  const linkSubjects = otherLinks.map(node => node.getAttribute('about'))
  const uniqueSubjects = [...new Set(linkSubjects)]
  let triples = uniqueSubjects
    .map(s => {
      let nodes = [...doc.querySelectorAll(`[about="${s}"]`)]
      return nodes
        .map(node => {
          return `<${s}> ${node.getAttribute('rel')} <${getO(node)}> .`
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
const getStatementsAboutThisSubject = ({doc, s}) => {
  const subjectNodes = [...doc.querySelectorAll(`[rel="${p}"]`)]
  let triples = subjectNodes
    .map(node => `<${s}> ${p} <${getO(node)}> .`)
  return triples
}

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it.skip('Finds triple statements within an HTML Document', () => {
    // TEST TK: Feed it an HTML Document and test for array of triples. 
    expect('a').toStrictEqual('b')
  })
}
export const rdfa2triples = ({doc, s}) => {
  let thisTriples = getStatementsAboutThisSubject({doc, s})
  let otherTriples = getStatementsAboutOtherSubjects({doc, s})
  return [...thisTriples, ...otherTriples]
}
