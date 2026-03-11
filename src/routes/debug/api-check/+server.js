import { instance } from '$env/static/private'

export async function GET() {
  const base = instance.replace(/\/$/, '')

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>API Check</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: monospace; padding: 2rem; background: #111; color: #ddd; font-size: 13px; }
    h1 { margin-bottom: 0.5rem; font-size: 1.2rem; }
    .controls { margin-bottom: 1.5rem; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
    .controls label { color: #888; }
    .controls input { background: #222; border: 1px solid #444; color: #ddd; padding: 4px 8px; font-family: monospace; font-size: 13px; }
    button { background: #234; border: 1px solid #456; color: #6af; padding: 3px 10px; cursor: pointer; font-family: monospace; font-size: 12px; }
    button:hover { background: #345; }
    button:disabled { opacity: 0.4; cursor: default; }
    button.run-group { background: #342; border-color: #564; color: #af6; }
    button.run-group:hover { background: #453; }
    a { color: #6af; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .section { margin-bottom: 2rem; }
    .section-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
    .section-header h2 { font-size: 1rem; margin: 0; }
    .section-header .result-summary { color: #666; font-size: 11px; }
    table { border-collapse: collapse; width: 100%; }
    th { text-align: left; padding: 4px 8px; border-bottom: 1px solid #333; color: #888; }
    td { padding: 4px 8px; border-bottom: 1px solid #222; vertical-align: middle; }
    tr:hover { background: #1a1a1a; }
    .col-action { width: 50px; }
    .col-result { width: 80px; text-align: right; }
    .col-ms { width: 60px; text-align: right; color: #666; }
    .tag { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 11px; margin-right: 4px; }
    .tag-as { background: #324; color: #a6f; }
    .tag-param { background: #333; color: #aaa; }
    .result-pending { color: #555; }
    .result-ok { color: #6c6; }
    .result-empty { color: #cc6; }
    .result-error { color: #c66; }
    .ms-slow { color: #c66; }
    .global-summary { margin-bottom: 1.5rem; padding: 8px 12px; background: #1a1a1a; border: 1px solid #333; display: none; }
    .col-sparql { vertical-align: top; }
    .sparql-toggle { font-size: 11px; padding: 1px 6px; background: #222; border: 1px solid #444; color: #888; }
    .sparql-toggle:hover { color: #ddd; background: #333; }
    .sparql-block { margin-top: 4px; position: relative; }
    .sparql-block pre { background: #1a1a1a; border: 1px solid #333; padding: 8px; overflow-x: auto; max-width: 80vw; font-size: 11px; color: #aaa; white-space: pre-wrap; word-break: break-all; }
    .sparql-copy { position: absolute; top: 2px; right: 2px; font-size: 10px; padding: 1px 5px; }
    .global-summary span { font-weight: bold; }
    .global-summary .ok { color: #6c6; }
    .global-summary .empty { color: #cc6; }
    .global-summary .err { color: #c66; }
  </style>
</head>
<body>
  <h1>API Check</h1>
  <div class="controls">
    <label>s=</label><input id="subjects" value="localhost,demo.ideastore.dev" size="35">
    <label>o=</label><input id="objects" value="demo" size="15">
    <label>rt=</label><input id="relterms" value="" size="15" placeholder="(relationship terms)">
    <button onclick="runAll()">Run All</button>
  </div>
  <div class="global-summary" id="global-summary"></div>
  <div id="sections"></div>

<script>
const BASE = '${base}'

const whats = ['everything', 'pages', 'thorpes', 'domains']
const bys = [
  { by: 'thorped',    needsObject: true,  isLinkType: false },
  { by: 'linked',     needsObject: true,  isLinkType: true },
  { by: 'backlinked', needsObject: true,  isLinkType: true },
  { by: 'cited',      needsObject: true,  isLinkType: true },
  { by: 'bookmarked', needsObject: true,  isLinkType: true },
  { by: 'posted',     needsObject: false, isLinkType: false },
]
const formats = ['', 'debug', 'rss']
const extras = [
  {},
  { when: 'recent' },
  { when: 'before-2025-01-01' },
  { when: 'after-2024-01-01' },
  { match: 'all' },
  { limit: '1' },
  { rt: 'demo' },
]

function getParams() {
  return {
    s: document.getElementById('subjects').value,
    o: document.getElementById('objects').value,
    rt: document.getElementById('relterms').value,
  }
}

function buildUrl(what, by, as, params) {
  const path = as ? BASE + '/get/' + what + '/' + by + '/' + as : BASE + '/get/' + what + '/' + by
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, v)
  }
  const qs = sp.toString()
  return qs ? path + '?' + qs : path
}

function getResultCount(data, as) {
  if (as === 'debug') {
    const r = data?.actualResults
    return Array.isArray(r) ? r.length : '?'
  }
  const r = data?.results
  return Array.isArray(r) ? r.length : '?'
}

async function runOne(rowId, what, by, as, extraParams) {
  const row = document.getElementById(rowId)
  const resultCell = row.querySelector('.col-result')
  const msCell = row.querySelector('.col-ms')
  const sparqlCell = row.querySelector('.col-sparql')
  const btn = row.querySelector('button')
  btn.disabled = true
  resultCell.className = 'col-result result-pending'
  resultCell.textContent = '...'
  msCell.textContent = ''
  sparqlCell.innerHTML = ''

  const { s, o, rt } = getParams()
  const params = { s }
  if (by !== 'posted') params.o = o
  if (rt) params.rt = rt
  Object.assign(params, extraParams)

  // Always fetch the debug endpoint to get SPARQL + results
  const debugUrl = buildUrl(what, by, 'debug', params)
  row.querySelector('.endpoint-link').href = debugUrl

  const start = Date.now()
  try {
    const res = await fetch(debugUrl)
    const ms = Date.now() - start
    msCell.textContent = ms + 'ms'
    if (ms > 5000) msCell.classList.add('ms-slow')

    if (res.status >= 400) {
      resultCell.className = 'col-result result-error'
      resultCell.textContent = 'HTTP ' + res.status
      btn.disabled = false
      return { status: 'error' }
    }

    const data = await res.json()
    const results = data?.actualResults
    const count = Array.isArray(results) ? results.length : '?'
    const isEmpty = count === 0 || count === '0'
    resultCell.className = 'col-result ' + (isEmpty ? 'result-empty' : 'result-ok')
    resultCell.textContent = count

    // Show SPARQL with copy button
    if (data?.query) {
      const copyId = rowId + '-sparql'
      sparqlCell.innerHTML = '<button class="sparql-toggle" onclick="toggleSparql(\\'' + copyId + '\\')">sparql</button>'
        + '<div id="' + copyId + '" class="sparql-block" style="display:none">'
        + '<button class="sparql-copy" onclick="copySparql(\\'' + copyId + '\\')">copy</button>'
        + '<pre>' + escapeHtml(formatSparql(data.query)) + '</pre></div>'
    }

    btn.disabled = false
    return { status: isEmpty ? 'empty' : 'ok' }
  } catch (e) {
    const ms = Date.now() - start
    msCell.textContent = ms + 'ms'
    resultCell.className = 'col-result result-error'
    resultCell.textContent = e.message.slice(0, 30)
    btn.disabled = false
    return { status: 'error' }
  }
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function formatSparql(q) {
  // Basic formatting: newlines before keywords
  return q.replace(/(SELECT|WHERE|OPTIONAL|FILTER|ORDER|LIMIT|OFFSET|UNION|VALUES|BIND|MINUS)/g, '\\n\$1')
    .replace(/\\{/g, '{\\n  ').replace(/\\}/g, '\\n}').trim()
}

function toggleSparql(id) {
  const el = document.getElementById(id)
  el.style.display = el.style.display === 'none' ? 'block' : 'none'
}

function copySparql(id) {
  const pre = document.getElementById(id).querySelector('pre')
  navigator.clipboard.writeText(pre.textContent)
  const btn = document.getElementById(id).querySelector('.sparql-copy')
  btn.textContent = 'copied'
  setTimeout(() => btn.textContent = 'copy', 1500)
}

async function runGroup(what, by) {
  const section = document.getElementById('section-' + what + '-' + by)
  const rows = section.querySelectorAll('tr[id]')
  for (const row of rows) {
    const { what: w, by: b, as, extra } = JSON.parse(row.dataset.test)
    await runOne(row.id, w, b, as, extra)
  }
  updateGlobalSummary()
}

async function runAll() {
  const allRows = document.querySelectorAll('tr[id]')
  for (const row of allRows) {
    const { what, by, as, extra } = JSON.parse(row.dataset.test)
    await runOne(row.id, what, by, as, extra)
  }
  updateGlobalSummary()
}

function updateGlobalSummary() {
  const el = document.getElementById('global-summary')
  const all = document.querySelectorAll('.col-result')
  let ok = 0, empty = 0, err = 0, pending = 0
  all.forEach(c => {
    if (c.classList.contains('result-ok')) ok++
    else if (c.classList.contains('result-empty')) empty++
    else if (c.classList.contains('result-error')) err++
    else pending++
  })
  const total = ok + empty + err
  if (total === 0) { el.style.display = 'none'; return }
  el.style.display = 'block'
  el.innerHTML = total + ' tested' + (pending ? ' (' + pending + ' remaining)' : '') + ' | '
    + '<span class="ok">' + ok + ' ok</span> | '
    + '<span class="empty">' + empty + ' empty</span> | '
    + '<span class="err">' + err + ' errors</span>'
}

function buildSections() {
  const container = document.getElementById('sections')
  let html = ''
  let rowIdx = 0

  for (const what of whats) {
    for (const { by, needsObject, isLinkType } of bys) {
      if (what === 'domains' && by !== 'posted') continue

      const sectionId = 'section-' + what + '-' + by
      html += '<div class="section" id="' + sectionId + '">'
      html += '<div class="section-header">'
      html += '<h2>' + what + ' / ' + by + '</h2>'
      html += '<button class="run-group" onclick="runGroup(\\'' + what + '\\', \\'' + by + '\\')">run group</button>'
      html += '</div>'
      html += '<table><tr><th class="col-action"></th><th>Endpoint</th><th class="col-result">Result</th><th class="col-ms">Time</th><th>Query</th></tr>'

      for (const as of formats) {
        const baseExtra = {}
        const variations = [baseExtra]
        if (!as) {
          for (const extra of extras) {
            if (Object.keys(extra).length === 0) continue
            if (extra.match === 'all' && !needsObject) continue
            if (extra.rt && !isLinkType) continue
            variations.push(extra)
          }
        }

        for (const extra of variations) {
          const id = 'row-' + rowIdx++
          const testData = JSON.stringify({ what, by, as, extra })

          // Build a display URL pointing to debug variant
          const displayParams = { s: '{s}' }
          if (needsObject) displayParams.o = '{o}'
          if (extra.rt) displayParams.rt = extra.rt
          Object.assign(displayParams, extra)
          const debugAs = as || 'debug'
          const displayUrl = buildUrl(what, by, debugAs, displayParams)

          html += '<tr id="' + id + '" data-test="' + testData.replace(/"/g, '&quot;') + '">'
          html += '<td class="col-action"><button onclick="runOne(\\'' + id + '\\', \\'' + what + '\\', \\'' + by + '\\', \\'' + as + '\\', ' + JSON.stringify(extra).replace(/"/g, "'") + ').then(updateGlobalSummary)">run</button></td>'
          html += '<td>'
          if (as) html += '<span class="tag tag-as">' + as + '</span>'
          for (const [k, v] of Object.entries(extra)) html += '<span class="tag tag-param">' + k + '=' + v + '</span>'
          html += '<a class="endpoint-link" href="' + displayUrl + '" target="_blank">open</a>'
          html += '</td>'
          html += '<td class="col-result result-pending">--</td>'
          html += '<td class="col-ms"></td>'
          html += '<td class="col-sparql"></td>'
          html += '</tr>'
        }
      }

      html += '</table></div>'
    }
  }
  container.innerHTML = html
}

buildSections()
</script>
</body>
</html>`

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  })
}
