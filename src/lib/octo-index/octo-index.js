import { extractBlobject } from './extract.js'

;(async () => {
  const scriptTag = document.currentScript
  if (!scriptTag) {
    console.error('[octo-index] Cannot find script tag. Ensure octo-index.js is loaded via a <script> tag, not imported as a module.')
    return
  }

  const server = scriptTag.getAttribute('data-server')
  if (!server) {
    console.error('[octo-index] data-server attribute is required.')
    return
  }

  const debug = scriptTag.hasAttribute('data-debug')
  const harmonizerAttr = scriptTag.getAttribute('data-harmonizer')

  let customSchema = null
  if (harmonizerAttr) {
    try {
      customSchema = JSON.parse(harmonizerAttr)
    } catch (e) {
      console.error('[octo-index] Invalid data-harmonizer JSON:', e.message)
      return
    }
  }

  const debugEl = debug ? document.createElement('div') : null
  if (debugEl) {
    debugEl.setAttribute('data-octo-index-debug', '')
    debugEl.style.cssText = 'font-family:monospace;font-size:12px;padding:4px 8px;background:#f0f0f0;border:1px solid #ccc;margin:8px 0;'
    debugEl.textContent = '[octo-index] Extracting...'
    document.body.appendChild(debugEl)
  }

  const setStatus = (msg, isError = false) => {
    if (isError) {
      console.error(`[octo-index] ${msg}`)
    } else {
      console.log(`[octo-index] ${msg}`)
    }
    if (debugEl) {
      debugEl.textContent = `[octo-index] ${msg}`
      if (isError) debugEl.style.borderColor = debugEl.style.color = '#d32f2f'
    }
  }

  try {
    const blobject = extractBlobject(document, server, window.location.href, customSchema)

    setStatus(`Extracted ${blobject.octothorpes.length} octothorpe(s). Pushing...`)

    const normalizedServer = server.replace(/\/$/, '')
    const response = await fetch(`${normalizedServer}/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uri: blobject['@id'],
        as: 'blobject',
        blobject
      })
    })

    if (response.ok) {
      const result = await response.json()
      setStatus(`Indexed successfully (${blobject.octothorpes.length} octothorpe(s))`)
    } else {
      const text = await response.text()
      setStatus(`Server error ${response.status}: ${text}`, true)
    }
  } catch (e) {
    setStatus(`Error: ${e.message}`, true)
  }
})()
