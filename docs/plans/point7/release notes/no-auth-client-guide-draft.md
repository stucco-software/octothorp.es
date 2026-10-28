# Draft guide: connecting a no-auth client

Status: DRAFT for user-facing docs, 2026-10-27. Describes the tier shipped in
PR #338. Move to docs.octothorp.es when the PR merges and the wording settles.

A no-auth client reads a relay's open API and writes without SPARQL
credentials. There are two write paths: asking the relay to index a public
page (no credential at all), and submitting locally-harmonized blobject JSON
for documents the relay cannot fetch (one token). This guide covers setup and
both paths.

## What you need

- A relay that accepts submissions (`policies.access.submissions` set to
  `"registered"` or `"open"` in its profile — the default is `"never"`).
- A website you control, called your **anchor** (e.g. `yoursite.com`). The
  anchor is your identity: everything you submit is stored under it.
- The `octothorpes` package, or anything that can send HTTP.

## One-time setup

### 1. Pick a token and publish its hash

Choose a secret token (any string). Compute its SHA-256 hex digest and serve
this file at `https://yoursite.com/.well-known/octothorpes`:

```json
{ "submissionTokenHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" }
```

The plaintext token never appears on your site — only the hash does. The
relay proves you hold the token by hashing what you send and comparing.
A static host (GitHub Pages, Netlify, a folder of files) is enough.

To compute the hash:

    echo -n 'your-secret-token' | shasum -a 256

### 2. Register your anchor with the relay (registered mode only)

If the relay runs `submissions: "registered"`, your anchor must be a
verified origin on that relay first — the same registration as any OP site.
Open-mode relays skip this step.

### 3. Construct the client and shake hands

```js
import { createRemoteClient } from 'octothorpes'

const op = createRemoteClient({
  relay: 'https://your-relay.example',
  anchor: 'yoursite.com',
  token: 'your-secret-token',
  mode: 'request',               // must match the relay's indexing mode
})

const { ok, failures } = await op.handshake()
```

The handshake reads the relay's `/profile.json` and fails closed. It will
refuse to pair when:

- the relay's `policies.indexing.mode` doesn't match yours (active pairs
  with active, request with request — no mixing),
- the relay has `submissions: "never"` but you configured a token,
- the relay's profile is unreachable or malformed.

`failures` lists every reason in plain language. Fix the mismatch; don't
retry around it.

The constructor refuses SPARQL configuration of any kind. If you have
database credentials, you want `createClient`, not this.

## Writing

### Path 1: index a public page (no credential)

```js
await op.indexRequest('https://yoursite.com/some-post')
```

The relay fetches the page and harmonizes its markup — octothorpes, links,
bookmarks, aliases. This is the ordinary `/index` flow; the client is just a
convenience wrapper. Use this path whenever the document has a public URL.

### Path 2: submit a blobject (token)

For documents only you can see — `obsidian://` notes, local files — harmonize
locally and submit the result:

```js
const blobject = await harmonizeSource(markdown, null, { mode: 'markdown' })
blobject['@id'] = 'obsidian://open?vault=Notes&file=my-note'
await op.submitBlobject(blobject)
```

Rules the relay enforces, in order:

1. The subject (`@id`) must be an opaque URI whose scheme the relay declares
   in `policies.access.allows.schemes` (e.g. `obsidian`). A fetchable
   `https://` subject rejects the whole submission — claims about real pages
   must go through indexing, where the relay can verify them.
2. Every opaque URI in the submission (objects too) must use a declared
   scheme.
3. Your token must verify against your published hash. All auth failures
   return the same 403.
4. Rate limits apply, plus a per-document cooldown — resubmitting the same
   document inside the relay's `indexing.cooldown` window returns 429.

### What gets stored

Opaque URIs never enter the store raw. Each is rewritten under your anchor:

    obsidian://open?vault=Notes&file=my-note
      -> https://yoursite.com/.op/obsidian/open%3Fvault%3DNotes&file=my-note

and the relay writes `<https://yoursite.com> octo:claims <scoped-iri>` for
each one. Provenance is therefore a graph walk: scoped IRI -> `octo:claims`
-> your anchor. Submitted statements get none of the side effects a fetched
page gets — no `octo:verified`, no origin registration, no webring
membership.

## Reading

```js
const rows = await op.get('everything', 'linked', { st: 'Alias' })
```

`get` mirrors the relay's open `/get/{what}/{by}` API. Your own scoped IRIs
come back in results; contracting them back to the local form is string
surgery you can do because you know your own anchor — strip
`https://yoursite.com/.op/<scheme>/` and decode.

## Troubleshooting

- **403 "Anchor authentication failed."** — covers every auth failure
  (unreachable `.well-known`, missing file, wrong token). Check the file is
  served, is valid JSON, and the hash matches your token.
- **400 mentioning schemes** — the relay doesn't declare your URI scheme;
  ask the operator to add it to `allows.schemes`.
- **429** — rate bucket or the per-document cooldown; wait it out.
- **Handshake fails with a mode mismatch** — the relay runs a different
  `indexing.mode` than your client declares; this is a hard rule.

## Limits (current, by design)

- Submissions accept built-in relationship types (link, bookmark, cite,
  mention, alias, backlink); profile-declared custom link types are not yet
  accepted on this path.
- One anchor per client instance; multiple sites mean multiple clients.
- No deletion/retraction of submitted claims yet (rides the deletion wave).
