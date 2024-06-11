import { arrayify } from '$lib/arrayify.js'
import { instance } from '$env/static/private'
let p = 'octo:octothorpes'

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

const getStatementsAboutThisSubject = ({doc, s}) => {
  const subjectNodes = [...doc.querySelectorAll(`[rel="${p}"]`)]
  let triples = subjectNodes
    .map(node => `<${s}> ${p} <${getO(node)}> .`)
  return triples
}

export const rdfa2triples = ({doc, s}) => {
  let thisTriples = getStatementsAboutThisSubject({doc, s})
  let otherTriples = getStatementsAboutOtherSubjects({doc, s})
  return [...thisTriples, ...otherTriples]
}
