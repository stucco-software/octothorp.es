import { op } from '$lib/op.js'
import { buildVocabulary, vocabularyToJsonLd, vocabularyToTurtle } from 'octothorpes'

// #291: the generated vocabulary document. Stable path {instance}/vocabulary
// (spec §6.1), content-negotiated: Turtle, JSON-LD, or an HTML page rendered
// from the same data. Generated on request from the resolved profile; nothing
// is stored. Replaces the stale hand-written /vocab page.

const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const renderHtml = (vocab) => {
  const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`
  const iri = (x) => `<code>${escapeHtml(x)}</code>`
  const classRows = vocab.classes
    .map((c) =>
      row([
        iri(c.iri),
        escapeHtml(c.label),
        c.subClassOf.map(iri).join(', '),
        iri(c.isDefinedBy),
        escapeHtml(c.comment ?? ''),
      ])
    )
    .join('\n')
  const propRows = vocab.properties
    .map((p) =>
      row([
        iri(p.iri),
        escapeHtml(p.label),
        p.range ? iri(p.range) : '',
        iri(p.isDefinedBy),
        escapeHtml(p.comment ?? ''),
      ])
    )
    .join('\n')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Vocabulary — ${escapeHtml(vocab.instance)}</title>
<link rel="alternate" type="text/turtle" href="${escapeHtml(vocab.instance)}vocabulary">
<link rel="alternate" type="application/ld+json" href="${escapeHtml(vocab.instance)}vocabulary">
<style>
  body { font-family: system-ui, sans-serif; max-width: 72rem; margin: 2rem auto; padding: 0 1rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
  code { word-break: break-all; }
</style>
</head>
<body>
<h1>Vocabulary</h1>
<p>Terms used by <a href="${escapeHtml(vocab.instance)}">${escapeHtml(vocab.instance)}</a>:
core protocol terms plus the predicates and link types this instance declares.
Also available as <a href="${escapeHtml(vocab.instance)}vocabulary" type="text/turtle">Turtle</a>
and <a href="${escapeHtml(vocab.instance)}vocabulary" type="application/ld+json">JSON-LD</a>
via content negotiation.</p>
<p><em>${escapeHtml(vocab.note)}</em></p>
<h2>Classes</h2>
<table>
<thead><tr><th>IRI</th><th>Label</th><th>Subclass of</th><th>Defined by</th><th>Comment</th></tr></thead>
<tbody>
${classRows}
</tbody>
</table>
<h2>Properties</h2>
<table>
<thead><tr><th>IRI</th><th>Label</th><th>Range</th><th>Defined by</th><th>Comment</th></tr></thead>
<tbody>
${propRows}
</tbody>
</table>
</body>
</html>`
}

export function GET({ request }) {
  const vocab = buildVocabulary(op.resolvedProfile())
  const accept = request.headers.get('accept') ?? ''

  if (accept.includes('text/turtle')) {
    return new Response(vocabularyToTurtle(vocab), {
      headers: { 'Content-Type': 'text/turtle; charset=utf-8' },
    })
  }
  if (accept.includes('application/ld+json') || accept.includes('application/json')) {
    return new Response(JSON.stringify(vocabularyToJsonLd(vocab), null, 2), {
      headers: { 'Content-Type': 'application/ld+json; charset=utf-8' },
    })
  }
  return new Response(renderHtml(vocab), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
