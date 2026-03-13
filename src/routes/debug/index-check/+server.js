import { instance } from '$env/static/private'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import yaml from 'js-yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function GET() {
  const base = instance.replace(/\/$/, '')

  // Read and parse the YAML config
  const configPath = join(__dirname, 'test-urls.yaml')
  const configRaw = readFileSync(configPath, 'utf-8')
  const config = yaml.load(configRaw)

  // Built-in harmonizer IDs
  const builtInHarmonizers = ['default', 'openGraph', 'keywords', 'ghost']

  // Merge in custom harmonizers from config
  const customHarmonizers = config.customHarmonizers || []

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Index Check</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: monospace; padding: 2rem; background: #111; color: #ddd; font-size: 13px; }
    h1 { margin-bottom: 0.5rem; font-size: 1.2rem; }
    h2 { font-size: 1rem; margin: 0; }
    a { color: #6af; text-decoration: none; }
    a:hover { text-decoration: underline; }
    button { background: #234; border: 1px solid #456; color: #6af; padding: 3px 10px; cursor: pointer; font-family: monospace; font-size: 12px; }
    button:hover { background: #345; }
    button:disabled { opacity: 0.4; cursor: default; }
    button.live { background: #322; border-color: #644; color: #f86; }
    button.live:hover { background: #433; }
    button.run-set { background: #342; border-color: #564; color: #af6; }
    button.run-set:hover { background: #453; }

    .controls { margin-bottom: 1.5rem; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
    .controls label { color: #888; }
    .controls select, .controls input { background: #222; border: 1px solid #444; color: #ddd; padding: 4px 8px; font-family: monospace; font-size: 13px; }
    .controls select { min-width: 140px; }

    .global-actions { margin-bottom: 1rem; display: flex; gap: 0.5rem; }
    .global-summary { margin-bottom: 1.5rem; padding: 8px 12px; background: #1a1a1a; border: 1px solid #333; display: none; }
    .global-summary span { font-weight: bold; }
    .global-summary .ok { color: #6c6; }
    .global-summary .empty { color: #cc6; }
    .global-summary .err { color: #c66; }

    .section { margin-bottom: 2rem; }
    .section-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
    .section-desc { color: #888; font-size: 12px; margin-bottom: 0.5rem; }

    table { border-collapse: collapse; width: 100%; }
    th { text-align: left; padding: 4px 8px; border-bottom: 1px solid #333; color: #888; }
    td { padding: 4px 8px; border-bottom: 1px solid #222; vertical-align: top; }
    tr:hover { background: #1a1a1a; }

    .col-actions { width: 140px; white-space: nowrap; }
    .col-actions button { margin-right: 2px; }
    .col-result { width: 80px; text-align: right; }
    .col-ms { width: 60px; text-align: right; color: #666; }
    .col-links { width: 80px; white-space: nowrap; }

    .result-pending { color: #555; }
    .result-ok { color: #6c6; }
    .result-empty { color: #cc6; }
    .result-error { color: #c66; }
    .ms-slow { color: #c66; }

    .detail-panel { display: none; background: #1a1a1a; border: 1px solid #333; padding: 8px; margin-top: 4px; overflow-x: auto; max-width: 80vw; }
    .detail-panel pre { font-size: 11px; color: #aaa; white-space: pre-wrap; word-break: break-all; }
    .detail-toggle { font-size: 11px; padding: 1px 6px; background: #222; border: 1px solid #444; color: #888; cursor: pointer; }
    .detail-toggle:hover { color: #ddd; background: #333; }

    .method-section { margin-bottom: 2rem; }
    .method-entry { margin-bottom: 0.75rem; padding: 6px 8px; border-left: 2px solid #333; }
    .method-entry .note { color: #888; font-size: 11px; margin-top: 2px; }
    .method-links { display: flex; gap: 0.5rem; align-items: center; margin-top: 4px; }

    .custom-harmonizer-area { margin-bottom: 1.5rem; }
    .custom-harmonizer-area summary { cursor: pointer; color: #888; font-size: 12px; }
    .custom-harmonizer-area summary:hover { color: #ddd; }
    .custom-harmonizer-area textarea { width: 100%; max-width: 600px; height: 150px; background: #1a1a1a; border: 1px solid #333; color: #ddd; font-family: monospace; font-size: 12px; padding: 8px; margin-top: 4px; }

    hr { border: none; border-top: 1px solid #333; margin: 2rem 0; }
  </style>
</head>
<body>
  <h1>Index Check</h1>

  <div class="controls">
    <label>Harmonizer:</label>
    <select id="harmonizer-select">
      ${builtInHarmonizers.map(h => `<option value="${h}">${h}</option>`).join('\n      ')}
      ${customHarmonizers.map(h => {
        const val = h.url || h.id
        const label = h.name || val
        return `<option value="${val}">${label}</option>`
      }).join('\n      ')}
    </select>
    <label>or:</label>
    <input id="harmonizer-custom" placeholder="harmonizer ID or URL" size="35">
  </div>

  <details class="custom-harmonizer-area">
    <summary>Inline harmonizer JSON (overrides selector when filled)</summary>
    <textarea id="harmonizer-json" placeholder='Paste a harmonizer schema JSON here...'></textarea>
  </details>

  <div class="global-actions">
    <button onclick="runAllDry()">Harmonize All</button>
    <button class="live" onclick="runAllLive()">Index All</button>
  </div>
  <div class="global-summary" id="global-summary"></div>

  <div id="url-sets"></div>
  <hr>
  <h2 style="margin-bottom: 1rem;">Indexing Methods</h2>
  <div id="indexing-methods"></div>

<script>
const BASE = '${base}'
const CONFIG = ${JSON.stringify(config)}

function getHarmonizer() {
  // Inline JSON takes priority
  const jsonArea = document.getElementById('harmonizer-json')
  if (jsonArea && jsonArea.value.trim()) {
    try {
      JSON.parse(jsonArea.value.trim())
      return 'inline'
    } catch(e) {
      // fall through to selector
    }
  }
  const custom = document.getElementById('harmonizer-custom').value.trim()
  if (custom) return custom
  return document.getElementById('harmonizer-select').value
}

function getInlineHarmonizer() {
  const jsonArea = document.getElementById('harmonizer-json')
  if (jsonArea && jsonArea.value.trim()) {
    try {
      return JSON.parse(jsonArea.value.trim())
    } catch(e) {
      return null
    }
  }
  return null
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function apiResultsUrl(url) {
  return BASE + '/get/everything/posted/debug?s=' + encodeURIComponent(url)
}

function orchestraPitUrl(url, harmonizer) {
  return BASE + '/debug/orchestra-pit?uri=' + encodeURIComponent(url) + '&as=' + encodeURIComponent(harmonizer)
}

function indexUrl(url, harmonizer) {
  return BASE + '/indexwrapper?uri=' + encodeURIComponent(url) + '&as=' + encodeURIComponent(harmonizer)
}

async function runHarmonize(rowId) {
  const row = document.getElementById(rowId)
  const url = row.dataset.url
  const resultCell = row.querySelector('.col-result')
  const msCell = row.querySelector('.col-ms')
  const detailPanel = row.nextElementSibling?.querySelector('.detail-panel')

  resultCell.className = 'col-result result-pending'
  resultCell.textContent = '...'
  msCell.textContent = ''

  const harmonizer = getHarmonizer()
  const start = Date.now()

  try {
    let res
    const inlineSchema = getInlineHarmonizer()
    if (inlineSchema) {
      // For inline harmonizers, POST to orchestra-pit won't work,
      // so we use the remote harmonizer approach - encode as data URI
      // Actually, orchestra-pit only takes GET with ?as= param
      // For inline, we'd need to pass it differently. For now, show a note.
      // Best approach: use a data URI or just hit orchestra-pit with default and show the schema
      // Simpler: just POST the HTML through harmonizeSource locally... but we're client-side.
      // Practical solution: warn user that inline requires a hosted URL
      resultCell.className = 'col-result result-error'
      resultCell.textContent = 'inline N/A'
      msCell.textContent = ''
      if (detailPanel) {
        detailPanel.style.display = 'block'
        detailPanel.querySelector('pre').textContent = 'Inline harmonizer JSON cannot be used with dry-run (orchestra-pit only accepts harmonizer IDs or URLs).\\nHost the JSON at a URL and enter it in the harmonizer field, or use a local harmonizer ID.'
      }
      return { status: 'error' }
    }

    res = await fetch(orchestraPitUrl(url, harmonizer))
    const ms = Date.now() - start
    msCell.textContent = ms + 'ms'
    if (ms > 5000) msCell.classList.add('ms-slow')

    if (res.status >= 400) {
      resultCell.className = 'col-result result-error'
      resultCell.textContent = 'HTTP ' + res.status
      return { status: 'error' }
    }

    const data = await res.json()
    const thorpes = data?.octothorpes
    const count = Array.isArray(thorpes) ? thorpes.length : 0
    const hasTitle = !!data?.title
    const isEmpty = count === 0 && !hasTitle
    resultCell.className = 'col-result ' + (isEmpty ? 'result-empty' : 'result-ok')
    resultCell.textContent = count + ' thorpes'

    if (detailPanel) {
      detailPanel.querySelector('pre').textContent = JSON.stringify(data, null, 2)
    }

    return { status: isEmpty ? 'empty' : 'ok' }
  } catch (e) {
    const ms = Date.now() - start
    msCell.textContent = ms + 'ms'
    resultCell.className = 'col-result result-error'
    resultCell.textContent = e.message.slice(0, 30)
    return { status: 'error' }
  }
}

async function runIndex(rowId) {
  const row = document.getElementById(rowId)
  const url = row.dataset.url
  const resultCell = row.querySelector('.col-result')
  const msCell = row.querySelector('.col-ms')

  resultCell.className = 'col-result result-pending'
  resultCell.textContent = 'indexing...'
  msCell.textContent = ''

  const harmonizer = getHarmonizer()
  if (harmonizer === 'inline') {
    resultCell.className = 'col-result result-error'
    resultCell.textContent = 'inline N/A'
    return { status: 'error' }
  }

  const start = Date.now()
  try {
    const res = await fetch(indexUrl(url, harmonizer))
    const ms = Date.now() - start
    msCell.textContent = ms + 'ms'
    if (ms > 5000) msCell.classList.add('ms-slow')

    if (res.status >= 400) {
      const text = await res.text()
      resultCell.className = 'col-result result-error'
      resultCell.textContent = 'HTTP ' + res.status
      return { status: 'error' }
    }

    resultCell.className = 'col-result result-ok'
    resultCell.textContent = 'indexed'
    return { status: 'ok' }
  } catch(e) {
    const ms = Date.now() - start
    msCell.textContent = ms + 'ms'
    resultCell.className = 'col-result result-error'
    resultCell.textContent = e.message.slice(0, 30)
    return { status: 'error' }
  }
}

function toggleDetail(rowId) {
  const row = document.getElementById(rowId)
  const panel = row.nextElementSibling?.querySelector('.detail-panel')
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
  }
}

async function runSetDry(setIdx) {
  const rows = document.querySelectorAll('[data-set="' + setIdx + '"]')
  for (const row of rows) {
    await runHarmonize(row.id)
  }
  updateGlobalSummary()
}

async function runSetLive(setIdx) {
  const rows = document.querySelectorAll('[data-set="' + setIdx + '"]')
  for (const row of rows) {
    await runIndex(row.id)
  }
  updateGlobalSummary()
}

async function runAllDry() {
  const rows = document.querySelectorAll('tr[data-url]')
  for (const row of rows) {
    await runHarmonize(row.id)
  }
  updateGlobalSummary()
}

async function runAllLive() {
  const rows = document.querySelectorAll('tr[data-url]')
  for (const row of rows) {
    await runIndex(row.id)
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

function buildUrlSets() {
  const container = document.getElementById('url-sets')
  const sets = CONFIG.urlSets || []
  let html = ''
  let rowIdx = 0

  sets.forEach((set, setIdx) => {
    html += '<div class="section">'
    html += '<div class="section-header">'
    html += '<h2>' + escapeHtml(set.name) + '</h2>'
    html += '<button class="run-set" onclick="runSetDry(' + setIdx + ')">harmonize set</button>'
    html += '<button class="run-set live" onclick="runSetLive(' + setIdx + ')">index set</button>'
    html += '</div>'
    if (set.description) html += '<div class="section-desc">' + escapeHtml(set.description) + '</div>'

    html += '<table><tr><th class="col-actions"></th><th>URL</th><th class="col-links"></th><th class="col-result">Result</th><th class="col-ms">Time</th><th></th></tr>'

    const urls = set.urls || []
    urls.forEach(url => {
      const id = 'row-' + rowIdx++
      html += '<tr id="' + id + '" data-url="' + escapeHtml(url) + '" data-set="' + setIdx + '">'
      html += '<td class="col-actions">'
      html += '<button onclick="runHarmonize(\\'' + id + '\\').then(updateGlobalSummary)">harmonize</button>'
      html += '<button class="live" onclick="runIndex(\\'' + id + '\\').then(updateGlobalSummary)">index</button>'
      html += '</td>'
      html += '<td><a href="' + escapeHtml(url) + '" target="_blank">' + escapeHtml(url) + '</a></td>'
      html += '<td class="col-links"><a href="' + escapeHtml(apiResultsUrl(url)) + '" target="_blank">api results</a></td>'
      html += '<td class="col-result result-pending">--</td>'
      html += '<td class="col-ms"></td>'
      html += '<td><button class="detail-toggle" onclick="toggleDetail(\\'' + id + '\\')">detail</button></td>'
      html += '</tr>'
      html += '<tr><td colspan="6"><div class="detail-panel"><pre></pre></div></td></tr>'
    })

    html += '</table></div>'
  })

  container.innerHTML = html
}

function buildIndexingMethods() {
  const container = document.getElementById('indexing-methods')
  const methods = CONFIG.indexingMethods || []
  let html = ''
  let rowIdx = 1000 // offset to avoid ID collisions

  methods.forEach(method => {
    html += '<div class="method-section">'
    html += '<h2>' + escapeHtml(method.name) + '</h2>'
    if (method.description) html += '<div class="section-desc" style="margin-bottom: 0.5rem;">' + escapeHtml(method.description) + '</div>'

    const urls = method.urls || []
    urls.forEach(entry => {
      const url = typeof entry === 'string' ? entry : entry.url
      const note = typeof entry === 'object' ? entry.note : null
      const id = 'row-' + rowIdx++

      html += '<div class="method-entry">'
      html += '<a href="' + escapeHtml(url) + '" target="_blank">' + escapeHtml(url) + '</a>'
      if (note) html += '<div class="note">' + escapeHtml(note) + '</div>'
      html += '<div class="method-links">'
      html += '<a href="' + escapeHtml(apiResultsUrl(url)) + '" target="_blank">api results</a>'
      html += ' <button onclick="runMethodIndex(this, \\'' + escapeHtml(url) + '\\')">index</button>'
      html += ' <span class="method-result"></span>'
      html += '</div>'
      html += '</div>'
    })

    html += '</div>'
  })

  container.innerHTML = html
}

async function runMethodIndex(btn, url) {
  const resultSpan = btn.parentElement.querySelector('.method-result')
  resultSpan.className = 'method-result result-pending'
  resultSpan.textContent = 'indexing...'
  btn.disabled = true

  const harmonizer = getHarmonizer()
  if (harmonizer === 'inline') {
    resultSpan.className = 'method-result result-error'
    resultSpan.textContent = 'inline N/A'
    btn.disabled = false
    return
  }

  const start = Date.now()
  try {
    const res = await fetch(indexUrl(url, harmonizer))
    const ms = Date.now() - start
    if (res.status >= 400) {
      resultSpan.className = 'method-result result-error'
      resultSpan.textContent = 'HTTP ' + res.status + ' (' + ms + 'ms)'
    } else {
      resultSpan.className = 'method-result result-ok'
      resultSpan.textContent = 'indexed (' + ms + 'ms)'
    }
  } catch(e) {
    resultSpan.className = 'method-result result-error'
    resultSpan.textContent = e.message.slice(0, 30)
  }
  btn.disabled = false
}

buildUrlSets()
buildIndexingMethods()
</script>
</body>
</html>`

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  })
}
