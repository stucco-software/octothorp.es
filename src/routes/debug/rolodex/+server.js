import { error } from '@sveltejs/kit'
import { instance, server_name } from '$env/static/private'
import { queryBoolean } from '$lib/sparql.js'
import { handler } from '$lib/indexing.js'

const allowedDomains = [
  'localhost',
  'demo.ideastore.dev',
  'octothorp.es',
]

const isDomainAllowed = (uri) => {
  try {
    const { hostname } = new URL(uri)
    return allowedDomains.some(d => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}

const html = `<!doctype html>
<html>
<head><title>Test Indexing</title></head>
<body>
  <h2>Test Indexing Endpoint</h2>
  <form method="POST">
    <label>Endpoint:
      <select name="endpoint">
        <option value="">this page (direct handler)</option>
        <option value="/indexwrapper">/indexwrapper</option>
        <option value="/index">/index</option>
      </select>
    </label>
    <br><br>
    <label>URI: <input name="uri" type="url" size="60" required placeholder="https://demo.ideastore.dev"></label>
    <br><br>
    <label>Harmonizer: <input name="harmonizer" value="default" size="20"></label>
    <br><br>
    <button type="submit">Index</button>
  </form>
  <pre id="result"></pre>
  <script>
    document.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const form = new FormData(e.target)
      const uri = form.get('uri')
      const harmonizer = form.get('harmonizer')
      const endpoint = form.get('endpoint')
      const result = document.getElementById('result')
      result.textContent = 'Indexing...'
      try {
        let url, opts
        if (endpoint) {
          url = endpoint + '?uri=' + encodeURIComponent(uri) + '&as=' + encodeURIComponent(harmonizer)
          opts = { method: 'GET' }
        } else {
          url = ''
          opts = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uri, harmonizer })
          }
        }
        const res = await fetch(url, opts)
        const text = await res.text()
        try { result.textContent = res.status + '\\n' + JSON.stringify(JSON.parse(text), null, 2) }
        catch { result.textContent = res.status + '\\n' + text }
      } catch (err) {
        result.textContent = 'Error: ' + err.message
      }
    })
  </script>
</body>
</html>`

export async function GET() {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  })
}

export async function POST({ request }) {
  const { uri, harmonizer = 'default' } = await request.json()

  if (!uri) {
    return error(400, 'URI is required.')
  }

  if (!isDomainAllowed(uri)) {
    return error(403, 'Domain not in whitelist.')
  }

  try {
    await handler(uri, harmonizer, uri, {
      instance,
      serverName: server_name,
      queryBoolean
    })
    return new Response(JSON.stringify({ status: 'success', uri }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ status: 'error', message: e.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
