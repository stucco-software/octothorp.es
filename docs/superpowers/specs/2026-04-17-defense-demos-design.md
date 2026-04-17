# Live Demos of OP Defense Mechanisms

## Purpose

Show humans, in the browser, that the Octothorpes Protocol defends against specific misrepresentation attacks. The demos replace the static description in `docs/examples/attack-scenarios.html` with live pages that:

1. Explain each attack in plain English
2. Show the exact trigger (HTML, request URL, or curl command)
3. State the expected defense
4. Fire the attack against `https://octothorp.es/` and display the server's response
5. Render a pass/fail badge based on whether the response matches the expected error

## Attacks Covered

Seven attacks across three categories. Each has a corresponding defense in `src/lib/indexing.js` or `src/lib/harmonizeSource.js`, and most are covered by existing tests.

### Harmonizer attacks (4)

1. **Remote harmonizer, no origin header** — server-to-server request specifies `as=https://attacker.com/harmonizer.json` without an `Origin` or `Referer` header. Defense: `handler()` in `indexing.js` requires confirmed external origin for remote harmonizers. Expected error: "Remote harmonizers require a confirmed origin header."
2. **Remote harmonizer from non-whitelisted domain** — request has a confirmed origin (via browser headers) but specifies a harmonizer URL on a domain that is neither same-origin nor in the whitelist (`octothorp.es`, `localhost`). Defense: `isHarmonizerAllowed()` in `indexing.js`. Expected error: "Harmonizer not allowed for this origin."
3. **Remote harmonizer overriding `indexPolicy`** — attacker-supplied harmonizer includes a schema that extracts `indexPolicy` from untrusted content (e.g. `body` textContent), attempting to make a non-participating page look opted-in. Defense: `handler()` runs the policy check with the **default** harmonizer when a remote URL is requested — the attacker's schema never gets to influence the opt-in decision. Expected error: "Page has not opted in to indexing." Test: `indexing.test.js:1500`.
4. **SSRF via harmonizer URL** — request specifies `as=http://169.254.169.254/harmonizer.json` (cloud metadata) or a private IP. Defense: `isAllowedHarmonizerUrl()` in `harmonizeSource.js` blocks private IPs, cloud metadata, and requires HTTPS. Expected error: "Invalid harmonizer structure." (The server refuses to fetch, so harmonization fails and `handleHTML` throws this generic error. This is slightly muddy — see Unresolved Questions.)

### Opt-in/origin attacks (2)

5. **Non-participating page** — index request for a URL with no OP markup (no `<meta name="octo-policy">`, no `<link rel="octo:index">`, no preload/badge pointing at the instance, no `<octo-thorpe>` elements). Defense: `checkIndexingPolicy()` in `indexing.js`. Expected error: "Page has not opted in to indexing."
6. **Cross-origin indexing** — request from `demo.ideastore.dev` attempts to index `https://someone-else.com/page`. Defense: `validateSameOrigin()` in `uri.js` — comparing request `Origin` to the target URI's origin. Expected error: "Cannot index pages from a different origin."

### Rate limiting (1)

7. **Rate limit exceeded** — same origin fires `MAX_INDEXING_REQUESTS` (10) within the 60-second window. Defense: `checkIndexingRateLimit()` in `indexing.js`. Expected error: "Rate limit exceeded. Please try again later."

## Site Structure

Three new demo pages plus the existing `indexing-policy.md` stays in place. All pages live in `/Users/nim/dev/octodemo/demos/`.

### `demos/defenses-overview.md`

- Front matter: `permalink: defenses-overview`, `category: "Defenses"`, `tags: [demo, security]`
- Intro paragraph explaining what the demos show
- Summary table: attack name | category | expected defense | link to demo anchor
- Replaces `docs/examples/attack-scenarios.html` (which stays in the OP repo as internal test fodder, unchanged)

### `demos/defenses-harmonizer.md`

Covers attacks 1–4. One `<details>` block per attack, each with a stable id (e.g. `id="attack-no-origin"`, `attack-non-whitelisted`, `attack-policy-override`, `attack-ssrf`).

### `demos/defenses-opt-in.md`

Covers attacks 5–6. Same `<details>` structure, anchors `attack-no-opt-in` and `attack-cross-origin`.

### `demos/defenses-rate-limit.md`

Covers attack 7. Single attack, single page. Clicking "Run it" fires 11 rapid requests and shows the 11th returning 429.

## Per-Attack Block Format

Each `<details>` block on the grouped pages follows this structure:

```html
<details id="attack-{slug}">
<summary>{N}. {Attack name}</summary>

**What it tries to do:** {one sentence}

**Trigger:**
```{html|http|bash}
{markup, URL, or curl command}
```

**Expected defense:** {error message}

<button data-attack="{slug}">Run it</button>
<div class="attack-result" data-for="{slug}"></div>

</details>
```

## Supporting Assets

### Malicious harmonizers

Two JSON files hosted at `https://www.ideastore.dev/`:

#### `evil-harmonizer.json`

A normal-shaped harmonizer schema used for attack #2. Its content is unremarkable — the attack is about the *domain it lives on*, not what it does.

```json
{
  "@context": "https://octothorp.es/context.json",
  "@id": "https://www.ideastore.dev/evil-harmonizer.json",
  "@type": "harmonizer",
  "title": "Demo: Non-whitelisted harmonizer",
  "mode": "html",
  "schema": {
    "hashtag": {
      "s": "source",
      "o": [{ "selector": "meta[name='keywords']", "attribute": "content", "postProcess": { "method": "split", "params": "," } }]
    }
  }
}
```

#### `indexpolicy-override-harmonizer.json`

Tries the schema attack from `indexing.test.js:1500` — extracts `indexPolicy` from page body to bypass the opt-in check.

```json
{
  "@context": "https://octothorp.es/context.json",
  "@id": "https://www.ideastore.dev/indexpolicy-override-harmonizer.json",
  "@type": "harmonizer",
  "title": "Demo: indexPolicy override attempt",
  "mode": "html",
  "schema": {
    "subject": {
      "s": "source",
      "indexPolicy": [{ "selector": "body", "attribute": "textContent" }]
    }
  }
}
```

### Target pages

Attacks need target URLs. Two approaches:

- **Non-participating target** (attack #5, #3): point at a brand-new page with no OP markup. Use `https://www.ideastore.dev/plain-page.html` (empty body, no octo markup).
- **Cross-origin target** (attack #4): point at any URL whose origin differs from `demo.ideastore.dev` — `https://someone-else.example.com/page` works, since the defense triggers before the server ever fetches the URL.
- **Participating target** (for attack #1, #2, #3 which require a page that *would* be indexable if the harmonizer check passed): use an existing demo page like `https://demo.ideastore.dev/indexing-policy` which has opt-in markup. This isolates the harmonizer-rejection as the failure mode rather than mixing it with opt-in failures.

## Attack Execution Details

### Attacks that can be triggered from the browser (button)

- **#2 non-whitelisted** — `fetch('https://octothorp.es/index?uri=...&as=https://www.ideastore.dev/evil-harmonizer.json')`. Browser sends `Origin: https://demo.ideastore.dev`, which is a confirmed external origin, so the domain allowlist check runs and rejects.
- **#3 policy override** — `fetch('https://octothorp.es/index?uri=https://www.ideastore.dev/plain-page.html&as=https://www.ideastore.dev/indexpolicy-override-harmonizer.json')`. Same origin handling, but server's policy check uses default harmonizer so the attack fails at opt-in.
- **#4 SSRF** — `fetch('https://octothorp.es/index?uri=...&as=http://169.254.169.254/harmonizer.json')`. Server refuses to fetch the metadata endpoint; `harmonizeSource` throws the generic "Invalid harmonizer structure" error. The block prose explains this message is how SSRF defense surfaces to callers (see Unresolved Questions).
- **#5 non-participating** — `fetch('https://octothorp.es/index?uri=https://www.ideastore.dev/plain-page.html')`.
- **#6 cross-origin** — `fetch('https://octothorp.es/index?uri=https://someone-else.example.com/page')`.
- **#7 rate limit** — fire 11 `fetch` calls with `Promise.all`; show the 11th returning 429.

### Attacks that must be triggered via curl (display only, no button)

- **#1 no origin header** — browsers always attach Origin or Referer on cross-origin requests. Accurate demo is a displayed `curl` command:
  ```
  curl 'https://octothorp.es/index?uri=https://www.ideastore.dev/indexing-policy&as=https://www.ideastore.dev/evil-harmonizer.json'
  ```
  Plus expected response. No clickable button.

## Pass/Fail Badge Logic

Client-side JS on each demo page:

```js
async function runAttack(slug, url, expectedErrorSubstring) {
  const res = await fetch(url)
  const text = await res.text()
  const passed = !res.ok && text.toLowerCase().includes(expectedErrorSubstring.toLowerCase())
  renderResult(slug, { status: res.status, body: text, passed })
}
```

Pass = response is an error (not 2xx) AND body contains the expected error substring. Fail = 2xx response OR error message doesn't match (defense may have changed).

## Expected Error Substrings (for pass/fail matching)

| Attack | Expected substring |
|--------|-------------------|
| #1 no origin | `Remote harmonizers require a confirmed origin header` |
| #2 non-whitelisted | `Harmonizer not allowed for this origin` |
| #3 policy override | `Page has not opted in to indexing` |
| #4 SSRF | `Invalid harmonizer structure` (muddy — see below) |
| #5 non-participating | `Page has not opted in to indexing` |
| #6 cross-origin | `different origin` |
| #7 rate limit | `Rate limit exceeded` |

## Hosting Details

- Demo pages built by Jekyll on `demo.ideastore.dev` (follow octodemo conventions)
- Two malicious harmonizer JSON files and one blank target HTML file uploaded to `www.ideastore.dev` (separate host, outside `octothorp.es` and `localhost` whitelist)
- OP server: `https://octothorp.es/` (as per octodemo skill)

## Unresolved Questions

### SSRF error message

The SSRF defense in `harmonizeSource.js` returns `null` from `remoteHarmonizer()`, which then causes `harmonizeSource` to throw `"Invalid harmonizer structure"`. This error message is shared with other remote-harmonizer failures (malformed JSON, missing title, etc.) so the pass/fail matcher can't distinguish SSRF rejection from other failures.

**Options:**
1. Accept the ambiguity — the badge still goes green because the attack was blocked; the block reason is explained in prose
2. Change `harmonizeSource.js` to propagate a more specific SSRF error. This is out of scope for this spec but would improve the demo.
3. Display server logs as part of the result — not practical from the browser.

**Decision for this spec:** option 1. Note the ambiguity in the attack #4 description; defer a more specific error message to a separate spec.

### Rate limit state bleed-over

Attack #7 burns 11 requests from the demo page's origin, which will trip the rate limit for *any* other demo on `demo.ideastore.dev` for the next 60 seconds. Users clicking attack #7, then trying attack #2, will see attack #2 also fail with 429 (wrong defense).

**Options:**
1. Accept it — add a visible cooldown timer after #7 runs; other demos show a warning if clicked within the window
2. Put attack #7 on its own subdomain
3. Mock attack #7 — show curl + expected response without firing real requests

**Decision for this spec:** option 1. Cheapest and honest; also teaches about rate limits.

## Out of Scope

- Changing error messages in `indexing.js` / `harmonizeSource.js` to make them more demo-friendly
- Adding new defenses
- Updating `docs.octothorp.es` (documentation site) — these demos live on `demo.ideastore.dev`
- Updating `site-index.md` navigation (per octodemo skill: author handles this)
- Copywriting the prose on each page (per octodemo skill: author handles this; spec provides skeletons)

## Success Criteria

1. Clicking "Run it" on each button-driven attack returns an error response from `https://octothorp.es/`
2. Pass/fail badge turns green for all 7 attacks when defenses are working
3. Overview page table links to each attack's anchor on its grouped page
4. All four demo pages render correctly under Jekyll with standard front matter
5. `www.ideastore.dev/evil-harmonizer.json`, `www.ideastore.dev/indexpolicy-override-harmonizer.json`, and `www.ideastore.dev/plain-page.html` are reachable and return expected content-types
