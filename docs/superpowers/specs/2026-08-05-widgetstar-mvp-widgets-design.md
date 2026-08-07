# Widgetstar MVP Widgets — Design

**Date:** 2026-08-05
**Status:** Approved, ready for implementation planning
**Related:** #254 (build debris, v0.7), #255 (Svelte 5 CE factory, v0.8)

## Summary

Ship two Octothorpes widgets for Widgetstar's custom-widget system: a hashtag
browser and a backlinks list. Both are hand-written classic scripts with no
build step, served as versioned static files from the SvelteKit site.

Widgetstar is Kicya's embed platform (same parent company as Nekoweb). Its
parent script, `https://u.widget.st/ar.js`, defines a single `<ws-widget>`
custom element that renders either an iframe or an injected script. Its
"build your own widget" form accepts an absolute URL to an external script,
which is the integration surface this design targets.

## Background: the Widgetstar contract

### What `ar.js` does

One custom element, `<ws-widget>`, with observed attributes `type wid iid name
settings auto predefine width height embed preview`. The built-in type registry
is hardcoded inline, and every URL is a hardcoded `https://widget.st` template
literal — so third-party origins are not reachable through the element itself.

First-party widgets come in two flavours:

- **Script mode** (12 of 14 built-in types). A `<script>` is appended to the
  `<ws-widget>`; it must synchronously define `window['_ws_embed_' + iid]`,
  which the host then calls with `(hostElement, getCaptchaToken,
  resilientFetch, createOwnerAuth)` and deletes.
- **iframe mode.** Sizing is a two-way postMessage handshake. The child posts
  `{type:'ws:resize', w, h}`; the host sets pixel dimensions and a `data-sized`
  attribute that flips `visibility: hidden` to `visible`. Without that message
  the iframe stays 0×0 and invisible. Note the asymmetric key names — `w`/`h`
  upward, `width`/`height` downward.

### What custom widgets get instead

The custom-widget form documents a simpler and entirely separate contract:

```js
const element  = document.currentScript.parentElement;
const settings = JSON.parse(decodeURIComponent(document.currentScript.dataset.settings));
```

`ar.js` never sets `data-settings` on the script it appends, so `/embed/<iid>`
for a custom widget must return a generated bootstrap that injects a second
`<script>` — src set to the author's external URL, `data-settings` set to the
configured blob. This is inferred rather than documented; see *Known unknowns*.

Three consequences drive the whole design:

1. **Classic script, mandatory.** `document.currentScript` is `null` in ES
   modules by specification, and `null` inside any async continuation. The file
   must be a classic script that captures the handoff on its first synchronous
   tick.
2. **No injected capabilities.** `ar.js` reads `getCaptchaToken` and
   `resilientFetch` off `window` and `delete`s them before any widget script
   runs. Custom widgets get plain `fetch`, subject to the embedding page's
   `connect-src`, with no CSP bridge fallback. (`window.createOwnerAuth` is
   assigned but never deleted, so it does survive — we do not use it.)
3. **Script mode runs in the host page's context.** `window.location.href` is
   therefore the user's real page URL, not `widget.st`. This is only true for
   script mode; in iframe mode it would resolve to `widget.st`, and
   `document.referrer` under the default `strict-origin-when-cross-origin`
   yields only an origin, not a path.

### Security posture

A custom widget runs unsandboxed in the embedding site's origin — full DOM,
cookies, and localStorage of the host — loaded from a mutable third-party URL
with no SRI and no version pinning. Installing one is unbounded, ongoing trust
in that URL's owner.

This is the same trust model as any third-party analytics tag, but it sets
obligations for us as a publisher: serve from an immutable versioned path so a
site owner can pin, keep the bundle small enough to actually read, escape all
third-party content, and never throw uncaught.

## Scope

**In scope.** Two read-only display widgets. All Widgetstar users are assumed
already registered with an OP instance, so no registration or indexing step is
part of the MVP.

**Out of scope.** Authentication, captcha, iframe-mode embedding, the resize
handshake, webring functionality, and any change to the existing Svelte web
components or their build pipeline.

## Architecture

### File layout

```
static/widgets/v1/octo-hashtags.js     hand-written, no build
static/widgets/v1/octo-backlinks.js    hand-written, no build
static/widgets/harness.html            local test page, simulates the bootstrap
```

The harness sits outside `v1/` deliberately: that directory is the immutable
pinning surface and should contain only the files site owners link to.

No bundler. The Widgetstar contract forbids exactly what a bundler provides —
ES modules and imports — so running Vite would produce something structurally
simpler than its input, while making the synchronous-`currentScript` invariant
something to re-verify on every build rather than something self-evident in the
source. `static/tag.js` and `static/ring.js` already establish this pattern.

`v1/` is the versioning seam. Since Widgetstar's form accepts a bare URL with
no `integrity` attribute, an immutable versioned path is the only pinning
available to a site owner.

The existing Svelte components and their build step are unchanged. The split is
by complexity: display-only widgets go vanilla, interactive components like
`octo-multipass-loader` keep their framework.

### Shared entry shape

Both files open identically. The handoff capture must precede anything async:

```js
(function () {
  var script = document.currentScript;      // must be first
  var mount  = script.parentElement;

  // re-entrancy guard, namespaced per widget
  if (mount.dataset.octoHashtagsInit) return;
  mount.dataset.octoHashtagsInit = '1';

  var settings = {};
  try {
    settings = JSON.parse(decodeURIComponent(script.dataset.settings || '')) || {};
  } catch (e) { /* fall through to defaults */ }

  // everything from here may be async
})();
```

The re-entrancy guard matters because `ar.js` re-renders on attribute change
(`attributeChangedCallback` → `_queueRender` → `render`), which re-appends the
script. Without the guard a second run would call `attachShadow` twice and
throw.

Content is read after DOM readiness, not at capture time: if
`document.readyState === 'loading'`, defer to `DOMContentLoaded`. The element
reference is captured synchronously; only reading its children is deferred.

### Rendering

`attachShadow({mode: 'open'})` on the mount element. This stops light-DOM
children rendering, so the author's raw tag text and the injected bootstrap
script disappear from view while remaining in the DOM for re-parsing — the same
approach `static/tag.js` takes.

Styles are a template string inside the shadow root, exposing the existing
`--octo-*` custom properties on `:host`. Custom properties pierce shadow
boundaries, so this is the host site's only styling seam, and reusing the
established variable names means themes carry across from the Svelte
components.

## The widgets

### `octo-hashtags`

The author declares terms in the element's content:

```html
<ws-widget type="octo-hashtags" iid="…">coffee, zines, webrings</ws-widget>
<ws-widget type="octo-hashtags" iid="…">#coffee #zines #webrings</ws-widget>
```

**Parsing rules.** A leading `#` is optional and stripped when present; it is
never required. Text is gathered from the mount's child nodes **excluding
`<script>` elements**, so the injected bootstrap cannot pollute the term list.
If the text contains a comma, split on commas only — this preserves multi-word
terms. Otherwise split on whitespace. Strip a leading `#` from each token, trim,
drop empties, and de-duplicate.

Each term renders as a disclosure control. On first open it lazily fetches
`{server}/~/<term>` and lists the pages that thorped it. Results are cached per
term for the page's lifetime.

This is the behaviour of today's `static/tag.js`, without its fragile
preconditions: `tag.js` requires a `data-register` attribute and throws if no
`<link rel="preload" as="fetch">` already exists in the document.

Content-declared terms are also the safer channel. `ar.js` interpolates
`settings=${g}` into the query string **without encoding**, so a `#` in a
settings value would truncate the URL at the fragment.

### `octo-backlinks`

No authored content. Reads `window.location.href`, which in script mode is the
real host page.

```
GET {server}/get/pages/linked?o=<currentUrl>&limit=<limit>
```

This matches `createOctoQuery('pages', 'linked')` as used by the existing
`OctoBacklinks.svelte`. Renders a flat list of linking pages, with title falling
back to URL.

### Settings

Both widgets read the same blob, all keys optional:

| Key | Default | Meaning |
|---|---|---|
| `server` | `https://octothorp.es` | OP instance origin |
| `limit` | `10` | Max results. Sent as a query param by `octo-backlinks`; applied client-side per term by `octo-hashtags`, since `/~/<term>` takes no limit parameter |
| `emptyMessage` | per-widget | Shown when a query returns nothing |

`octo-hashtags` additionally accepts `tags` (array of strings) as an override
for authors who prefer configuring in Widgetstar's settings tab. Content-declared
terms take precedence when both are present.

Settings values must avoid `&` and `#` for the unencoded-interpolation reason
above. This constraint is documented for widget authors.

### Response shapes

`/get/{what}/{by}` requires an `Accept: application/json` request header and
returns `{ results: [...] }`; treat a missing `results` key as an empty array,
matching `octo-store.js`. A non-OK status is an error, not an empty result.

`/~/<term>` returns `{ uri, thorpes: [{ uri, title }] }` per server, where `uri`
is the responding instance. `octo-hashtags` groups results by instance origin,
as `static/tag.js` does.

## Data flow

1. Host page loads `ar.js`; `<ws-widget>` upgrades and renders.
2. `/embed/<iid>` returns the bootstrap, which injects our script with
   `data-settings`.
3. Our IIFE captures `currentScript`, `parentElement`, and settings
   synchronously; sets the init guard.
4. On DOM ready, the widget reads authored content (hashtags only), attaches a
   shadow root, and renders its initial state.
5. `octo-backlinks` fetches immediately. `octo-hashtags` fetches per term on
   first disclosure open.
6. Results are escaped and rendered into the shadow root.

## Error handling

The widget executes in someone else's origin, so it must never throw uncaught
and never spam the console.

- **CSP block.** With no `resilientFetch` available, a strict `connect-src` is a
  realistic failure. Register a `securitypolicyviolation` listener (the same
  cheap technique `ar.js` uses) to distinguish a policy block from a generic
  network failure, and say which one occurred in the rendered notice.
- **Network or HTTP error.** Inline notice within the shadow root.
- **Empty results.** Configurable `emptyMessage`; never a blank box.
- **Malformed settings.** Caught; defaults apply.
- **Escaping.** Results are third-party URLs and titles being injected into
  someone else's page. All values go through a text-node or escape helper.
  No raw `innerHTML` interpolation of fetched data anywhere.

## Testing

`src/tests/tag.test.js` currently re-implements `tag.js`'s logic inline, so it
tests a copy rather than the shipped file. These widgets do better: JSDOM with
`runScripts: 'dangerously'`, constructing a realistic `<ws-widget>` containing a
`<script>` whose `textContent` is the actual file. JSDOM sets
`document.currentScript` correctly in that arrangement, so the real handoff path
is exercised end to end.

Cases:

- Term parsing: bare, `#`-prefixed, mixed, comma-separated, multi-word,
  whitespace-separated, empty, duplicate, and `<script>`-polluted content
- Settings: valid, absent, malformed JSON, partial
- URL construction for both widgets, including encoding of the page URL
- Escaping of hostile titles and URLs in results
- Empty-result rendering
- Fetch rejection and non-OK response
- Double-init guard: a second script execution is a no-op

`harness.html` simulates the bootstrap locally — a container element plus a
script tag with a `data-settings` attribute — so both widgets can be exercised
against a live OP instance without a Widgetstar account.

## Accepted trade-offs

- **Duplicated helpers.** Roughly 40 lines of fetch and escape logic appear in
  both files. Imports are forbidden and a shared file would add a round trip.
- **Unminified.** Deliberate: auditability is a security property given the
  unsandboxed trust model.
- **Forked display logic.** These do not share code with the Svelte components.
  Mitigated by keeping them deliberately minimal rather than reproducing
  `OctoBacklinks.svelte`'s render modes. If they grow, an esbuild step can be
  added later without changing the contract.

## Known unknowns

- **Bootstrap shape is inferred.** Since `ar.js` never sets `data-settings`
  itself, `/embed/<iid>` must generate a script that injects ours with that
  attribute. The design depends only on the two facts the form states —
  `currentScript.parentElement` and `currentScript.dataset.settings` — so it
  holds regardless, but the first real embed should confirm it.
- **No developer documentation exists** for Widgetstar custom widgets beyond the
  form's inline instructions.
- **Re-render behaviour for custom widgets is untested.** The guard handles the
  double-execution case; whether `ar.js` also restores `_initialHTML` and
  strands a populated shadow root needs checking against a live instance.

## Follow-ups filed

- **#254** (v0.7) — stop committing built web components; fix `emptyOutDir`
  chunk accumulation. 120.8 KB of orphaned chunks and 18 sourcemaps are
  currently committed and served.
- **#255** (v0.8) — upgrade to Svelte 5 and migrate the custom-element factory.
  Also resolves the `octo-thorpe` double-definition between `static/tag.js` and
  `static/components/octo-thorpe.js`.
