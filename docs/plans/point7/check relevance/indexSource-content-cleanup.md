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
