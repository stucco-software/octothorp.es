import { vocabularyToJsonLd, vocabularyToTurtle } from 'octothorpes'

// #291: the generated vocabulary document. Stable path {instance}/vocabulary
// (spec §6.1), content-negotiated: Turtle, JSON-LD, or an HTML page rendered
// from the same data. Generated on request from the resolved profile; nothing
// is stored. Replaces the stale hand-written /vocab page.
//
// #324: content negotiation alone left the HTML page's "Turtle" and "JSON-LD"
// links dead — a browser click sends `Accept: text/html` no matter what the
// anchor's `type` attribute says. The two formats now also have their own
// paths, which is what those links point at, and this module holds the
// rendering the three routes share.

const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export const renderHtml = (vocab) => {
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
<link rel="alternate" type="text/turtle" href="${escapeHtml(vocab.instance)}vocabulary.ttl">
<link rel="alternate" type="application/ld+json" href="${escapeHtml(vocab.instance)}vocabulary.jsonld">
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
Also available as <a href="${escapeHtml(vocab.instance)}vocabulary.ttl" type="text/turtle">Turtle</a>
and <a href="${escapeHtml(vocab.instance)}vocabulary.jsonld" type="application/ld+json">JSON-LD</a>,
or by content negotiation on this path.</p>
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


/** Turtle response. The `.ttl` route and an `Accept: text/turtle` request share it. */
export const turtleResponse = (vocab) =>
  new Response(vocabularyToTurtle(vocab), {
    headers: { 'Content-Type': 'text/turtle; charset=utf-8' },
  })

/** JSON-LD response. The `.jsonld` route and an `Accept: application/ld+json` request share it. */
export const jsonLdResponse = (vocab) =>
  new Response(JSON.stringify(vocabularyToJsonLd(vocab), null, 2), {
    headers: { 'Content-Type': 'application/ld+json; charset=utf-8' },
  })

/** HTML response. */
export const htmlResponse = (vocab) =>
  new Response(renderHtml(vocab), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
