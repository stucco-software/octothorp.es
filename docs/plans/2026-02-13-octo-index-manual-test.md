# octo-index.js Manual E2E Test Steps

**Branch:** `190-octo-index`
**Prerequisite:** Local dev server and SPARQL endpoint running

---

## 1. Build components

```bash
npm run build:components
```

Verify `static/components/octo-index.js` exists and is non-empty.

## 2. Start the dev server

```bash
npm run dev
```

## 3. Create a test HTML page

Save this as `/tmp/octo-index-test.html`:

```html
<html>
<head>
  <title>Octo-Index Test Page</title>
  <meta name="description" content="Testing client-side push indexing">
</head>
<body>
  <h1>Test Page</h1>
  <octo-thorpe>test-tag</octo-thorpe>
  <octo-thorpe>client-push</octo-thorpe>
  <a rel="octo:octothorpes" href="https://octothorp.es/~/demo-term">demo term</a>
  <script
    src="http://localhost:5173/components/octo-index.js"
    data-server="http://localhost:5173"
    data-debug
  ></script>
</body>
</html>
```

## 4. Serve the test page from a registered origin

The test page must be served from an origin that is registered with your local OP instance. Options:

- **Option A:** Serve from a registered domain using a simple HTTP server and access via that origin
- **Option B:** Temporarily register `localhost:8080` (or similar) as an origin, then:
  ```bash
  cd /tmp && python3 -m http.server 8080
  ```
  Open `http://localhost:8080/octo-index-test.html`

If the origin isn't registered, expect a `401` error -- this confirms the validation pipeline works correctly.

## 5. Check results

**In the browser:**
- Console should show `[octo-index] Indexed successfully (3 octothorpe(s))`
- A debug element should appear on the page showing status (because `data-debug` is set)

**If you get errors:**
- `401` = origin not registered (expected if serving from unregistered origin)
- `429` = page recently indexed (cooldown is 5 minutes)
- `500` = server-side error (check terminal for details)

## 6. Compare with orchestra-pit

Verify the client-side extraction matches what the server's harmonizer would produce:

```
http://localhost:5173/debug/orchestra-pit?uri=<test-page-url>
```

Compare the octothorpes array from orchestra-pit with what the client logged to console.

## 7. Test the indexwrapper endpoint directly (optional)

You can also test the `as=blobject` POST directly with curl:

```bash
curl -X POST http://localhost:5173/indexwrapper \
  -H "Content-Type: application/json" \
  -H "Origin: <registered-origin>" \
  -d '{
    "uri": "<registered-origin>/test-page",
    "as": "blobject",
    "blobject": {
      "@id": "<registered-origin>/test-page",
      "title": "Curl Test",
      "description": "Testing blobject passthrough",
      "image": "",
      "contact": "",
      "type": "",
      "octothorpes": ["curl-test", "manual-verify"]
    }
  }'
```

Expected response: `{"status":"success","message":"Page indexed successfully",...}`

---

## When done

Return to Claude Code and say: `continue` to finish the development branch (run the finishing skill, update release notes, etc.)
