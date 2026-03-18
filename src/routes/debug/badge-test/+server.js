import { determineBadgeUri } from 'octothorpes'
import normalizeUrl from 'normalize-url'

const pngHeaders = {
  'Content-Type': 'image/png',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-cache',
}

// In-memory log of recent requests (max 50)
const requestLog = []
const MAX_LOG_SIZE = 50

function logRequest(entry) {
  requestLog.unshift({ ...entry, timestamp: new Date().toISOString() })
  if (requestLog.length > MAX_LOG_SIZE) {
    requestLog.pop()
  }
}

export async function GET({ request, url, fetch }) {
  // If ?log is present, return the log viewer
  if (url.searchParams.has('log')) {
    return new Response(renderLog(), {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  // If ?clear is present, clear the log and redirect to ?log
  if (url.searchParams.has('clear')) {
    requestLog.length = 0
    return new Response(null, {
      status: 302,
      headers: { Location: '/debug/badge-test?log' },
    })
  }

  // Otherwise, act like the badge endpoint
  const uriParam = url.searchParams.get('uri')
  const referer = request.headers.get('referer')
  const originHeader = request.headers.get('origin')
  const harmonizer = url.searchParams.get('as') ?? 'default'

  const pageUrl = determineBadgeUri(uriParam, referer)

  let parsed = null
  let normalizedPage = null
  let normalizedOrigin = null
  if (pageUrl) {
    try {
      parsed = new URL(pageUrl)
      normalizedPage = normalizeUrl(`${parsed.origin}${parsed.pathname}`)
      normalizedOrigin = normalizeUrl(parsed.origin)
    } catch (e) {
      // leave as null
    }
  }

  logRequest({
    raw: {
      uriParam,
      referer,
      originHeader,
      harmonizer,
    },
    resolved: {
      pageUrl,
      parsedOrigin: parsed?.origin ?? null,
      parsedHostname: parsed?.hostname ?? null,
      parsedPathname: parsed?.pathname ?? null,
      parsedSearch: parsed?.search ?? null,
      normalizedPage,
      normalizedOrigin,
    },
    request: {
      method: request.method,
      url: request.url,
      userAgent: request.headers.get('user-agent'),
      secFetchSite: request.headers.get('sec-fetch-site'),
      secFetchMode: request.headers.get('sec-fetch-mode'),
    },
  })

  const badgeResponse = await fetch('/badge.png')
  const badgeBuffer = await badgeResponse.arrayBuffer()
  return new Response(badgeBuffer, { headers: pngHeaders })
}

function renderLog() {
  const rows = requestLog.map((entry, i) => `
    <tr class="entry">
      <td class="idx">${i + 1}</td>
      <td class="time">${entry.timestamp}</td>
      <td class="data">
        <strong>referer:</strong> ${entry.raw.referer ?? '<span class="null">null</span>'}<br>
        <strong>uri param:</strong> ${entry.raw.uriParam ?? '<span class="null">null</span>'}<br>
        <strong>origin header:</strong> ${entry.raw.originHeader ?? '<span class="null">null</span>'}<br>
        <strong>resolved page:</strong> ${entry.resolved.normalizedPage ?? '<span class="null">null</span>'}<br>
        <strong>resolved origin:</strong> ${entry.resolved.normalizedOrigin ?? '<span class="null">null</span>'}<br>
        <strong>sec-fetch-site:</strong> ${entry.request.secFetchSite ?? '<span class="null">null</span>'}
      </td>
    </tr>
  `).join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>badge-test log</title>
  <meta http-equiv="refresh" content="3">
  <style>
    body { font-family: monospace; max-width: 900px; margin: 2rem auto; background: #1a1a1a; color: #e0e0e0; padding: 0 1rem; }
    h1 { font-size: 1.2rem; color: #ccc; }
    .info { color: #888; margin-bottom: 1rem; }
    .info code { background: #333; padding: 0.2rem 0.4rem; }
    a { color: #7af; }
    table { border-collapse: collapse; width: 100%; }
    tr.entry { border-bottom: 1px solid #333; }
    td { padding: 0.5rem; vertical-align: top; }
    td.idx { color: #666; width: 2rem; }
    td.time { color: #888; white-space: nowrap; width: 1%; }
    td.data { color: #cfc; }
    .null { color: #666; font-style: italic; }
    .empty { color: #666; padding: 2rem; text-align: center; }
  </style>
</head>
<body>
  <h1>badge-test log</h1>
  <p class="info">
    Badge URL: <code>/debug/badge-test</code> (or <code>/debug/badge-test?uri=...</code>)<br>
    Auto-refreshes every 3s. <a href="?clear">Clear log</a>
  </p>
  <table>
    ${rows || '<tr><td class="empty" colspan="3">No requests yet. Embed the badge on an external page to see data here.</td></tr>'}
  </table>
</body>
</html>`
}
