# indexSource content path cleanup

`createClient.indexSource()` in `packages/core/index.js` has a redundant path when `content` is provided: it harmonizes the content, sets `@id`, then calls `handleHTML` which harmonizes again. This should call `ingestBlobject` directly when content is already a blobject or pre-harmonized.

Current code (lines ~112-122 of `packages/core/index.js`):
```javascript
if (content !== undefined) {
  const blobject = await harmonize(content, harmonizer)
  blobject['@id'] = uri
  await indexer.handleHTML(
    { text: async () => (typeof content === 'string' ? content : JSON.stringify(content)) },
    uri,
    harmonizer,
    { instance: config.instance }
  )
  return { uri, indexed_at: Date.now() }
}
```

Should become something like:
```javascript
if (content !== undefined) {
  const blobject = await harmonize(content, harmonizer)
  if (blobject['@id'] === 'source') blobject['@id'] = uri
  await indexer.ingestBlobject(blobject, { instance: config.instance })
  return { uri, indexed_at: Date.now() }
}
```


Bug discovered on `main` branch using legacy index path, confirm if it needs to be fixed here:


Root cause:** `handler()` in `src/lib/indexing.js:648` hardcoded `'default'` for the on-page policy check. A site using the `keywords` harmonizer has `<meta name="keywords">` but none of the markup the default harmonizer recognizes, so `policyHarmed.octothorpes` stayed empty and `checkIndexingPolicy` rejected with "Page has not opted in to indexing." `orchestra-pit` worked because it skips the policy check entirely.

**Fix:** Use the requested harmonizer for the policy check when it's a local ID; fall back to `'default'` for remote URLs (preserves defense-in-depth against attacker-supplied schemas swaying opt-in). Added test `"should use requested harmonizer for policy check (implicit opt-in via keywords)"`.

Also see
