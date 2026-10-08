# Design: OP Member Site (turnkey, Railway, on-site editing)

Status: design for a dev spike
Date: 2026-10-06
Related: `2026-10-06-lite-relay-proposal.md`

## Summary

A personal website that belongs to an OP relay. The owner writes posts by editing in place on the live site. Each save writes the post and asks the relay to index it. Visitors see the social features through the existing `octo-*` web components: backlinks, other members' posts on the same term, webrings, and badges.

It ships as a single container deployed through a Railway template into the user's own Railway account. The user owns the account, the bill, the domain, and the content. We ship the image and the template; Railway's template kickback pays us a share of usage. A PikaPods listing comes later, from the same image.

A member site is an OP *client*, not a relay. It has no triplestore. It talks to a relay over HTTP.

## Goals

- **Deploy:** one-click deploy to Railway, then a first-boot setup wizard. No `.env` editing required.
- **Edit:** the owner edits and posts in place on the live site; visitors never load editor code.
- **Index:** posts are indexed by the relay as soon as they're saved.
- **Social:** social features come from existing `octo-*` components, not new protocol work.
- **Customize:** layered customization — settings page, then CSS, then templates.
- **Exit:** the owner can leave at any time with a full export (static HTML plus source data).

## Non-goals (for the spike)

- Multiple authors or accounts.
- Comments or replies hosted on the member site. Replies are posts on other members' sites that link here, and they show up through backlinks.
- Running a relay. This is covered by the lite relay proposal.
- PikaPods packaging.
- Custom-domain automation. The user sets it up in Railway; see open questions.

## Architecture

```
                 Railway project (user's account)
┌──────────────────────────────────────────────────────┐
│  member service (our image)                          │
│   server.js  ── Hono                                 │
│     ├─ public pages (Liquid theme, server-rendered)  │
│     ├─ /admin  (login, settings, new post)           │
│     ├─ /api    (posts CRUD, uploads, export)         │
│     └─ relay client (fetch → relay /index, /get)     │
│                                                      │
│  volume /data                                        │
│     config.json  posts/  uploads/  theme/ (overrides)│
└──────────────────────────────────────────────────────┘
          │ POST /index (server-to-server)
          ▼
   OP relay (octothorp.es by default)
          ▲
          │ GET /get/... (from visitors' browsers via octo-* components)
```

- **Runtime:** Node 20+, Hono, liquidjs, and `octothorpes` core (for `sanitizeHtml`, `rss`, and `harmonizeSource` previews).
- **Code and content are separate.** The image contains code and the default theme. The `/data` volume contains everything the owner created. Updating means deploying a new image tag; nothing in `/data` is touched.

## Content model

Each post is one JSON file at `/data/posts/<slug>.json`:

```json
{
  "slug": "first-tomatoes",
  "title": "First tomatoes",
  "description": "The garden finally produced.",
  "date": "2026-10-06T14:00:00Z",
  "updated": "2026-10-06T15:12:00Z",
  "terms": ["gardening", "tomatoes"],
  "image": "/uploads/tomatoes.webp",
  "body": "<p>…sanitized HTML…</p>",
  "draft": false
}
```

Why JSON plus a theme template, rather than saving whole HTML files:
- A theme change applies to every post.
- The editor only touches `title`, `body`, and `terms`. It can't break the page shell or the harmonizer markup.
- The OP markup is produced by the template, so it's always correct.

### Harmonizer contract

The post template emits exactly what the default harmonizer (`packages/core/harmonizers.js`) reads, so no custom harmonizer is needed:

| Blobject field | Markup emitted by `post.liquid` |
|---|---|
| title | `<title>` |
| description | `<meta name="description">` |
| image | `<meta property="og:image">` |
| postDate | `<time datetime>` (also `meta property="article:published_time"`) |
| terms | `<octo-thorpe>term</octo-thorpe>` per term |
| links | `<a rel="octo:octothorpes">` (body links) |
| bookmarks / citations | `<a rel="octo:bookmarks">`, `<a rel="octo:cites">` (set via the editor's link dialog) |

Spike task: index a generated post against a dev relay and diff the stored blobject against the JSON file.

### Inline hashtags

On save, the server turns `#word` in body text into `<octo-thorpe>word</octo-thorpe>` and adds `word` to `terms`.

## Owner editing

**`<op-editor>`** is a framework-free web component served from `/admin/editor.js`.

- **Who gets it:** the page template includes the script only when the request carries a valid owner session cookie. Visitors never download it.
- **Turning it on:** `⌘E` / `Ctrl+E`, or the "Edit" link in the owner bar.
- **What's editable:** the title and the body region become `contenteditable`. Term chips are added and removed in a field under the title, with autocomplete from the relay's terms (`/get/terms`, proxied through `/api/terms` to avoid CORS).
- **Toolbar:** bold, italic, heading, list, quote, link, image.
- **Link dialog:** URL plus a "relationship" select (plain / bookmark / cite), which sets `rel`.
- **Images:** paste or upload goes to `POST /api/uploads`, which stores the file in `/data/uploads`. Spike: no resizing. Later: client-side WebP re-encoding, as editable.website does.
- **"New post":** `/admin/new` opens an empty post in the editor.
- **"Reply to…":** `/admin/new?reply=<url>` pre-fills the body with a link to that URL. The reply surfaces on the other site through `<octo-backlinks>`.
- **Save:** `PUT /api/posts/:slug` with `{title, body, terms, ...}`. The server then:
  1. sanitizes the body with core's `sanitizeHtml`
  2. writes the JSON file
  3. pings the relay (see below)
  4. returns the index result so the editor can show "Indexed" or the relay's error

**Editor implementation choice (spike decision):** plain `contenteditable` with a small command layer, or a bundled framework-agnostic editor such as Tiptap (MIT). The schema is deliberately narrow, so start with plain `contenteditable`. Switch if the HTML it produces is too messy to sanitize reliably.

Svedit is not used. It's Svelte-only, and editable.website itself is source-available with per-domain fees, so it can't be bundled.

## Relay integration

### Indexing

After a save, the server calls `POST <relay>/index` with `uri=<site>/posts/<slug>`.

- **The page is already live.** The post is servable before the ping because it's the same process, so there's no deploy-lag race (unlike GitHub Pages).
- **No same-origin rejection.** The ping is server-to-server. The relay's same-origin check only runs when an `Origin` header is present (`packages/core/indexer.js`, the handler's step 2), and the CORS-on-`/index` blocker in the merge audit doesn't apply.
- **Cooldown.** The relay applies a per-origin rate limit and per-page cooldown (`cooldown`, default 300s). Rapid re-saves will be refused. The editor shows "saved; will re-index in N minutes", and the server keeps a retry queue in memory.

### Disabling the components' auto-index

The `octo-*` components inject a `<link rel="preload">` that triggers indexing of the host page. The member site does its own indexing, so templates set `nopreload` on every component.

### Registration

The relay must accept the site's origin.
- Under `registration: open`, the first index registers it.
- Under `registered` or `closed`, the owner must go through the relay's registration flow (`/register` on octothorp.es, with email verification).

The setup wizard links to it with the origin pre-filled and checks status by test-indexing the home page.

### Deletion

There is no public delete route on the relay today. Core has `deletePage`, but it's not exposed over HTTP. For the spike, deleting a post removes the file and the page returns 410; the relay keeps the stale record. Follow-up: a relay route for an origin to delete its own pages.

### Previews

`harmonizeSource` from core runs the default harmonizer locally against the rendered post. The editor can then show "what the relay will see" (terms, links, date) before saving. This needs no relay call.

## Social features (visitor-facing)

All of these are existing components from `src/lib/web-components/`, configured with `server="<relay>"` and `nopreload`.

| Where | Component | Shows |
|---|---|---|
| Post footer | `<octo-backlinks>` | Pages on other sites that link to this post |
| Post term chips | `<octo-thorpe o="term">` | Other members' posts on the same term |
| Home sidebar | `<octo-thorpe o="<my top terms>" nots="<my origin>">` | "Around my terms": others' recent posts |
| Footer | `<octo-badge>` | Relay membership badge |
| Footer (optional) | webring (`static/ring.js`) | Ring navigation, if the owner joins a ring |

The home page's own post list renders on the server from `/data/posts`, not from the relay, so it works even when the relay is down.

**Component delivery:** for the spike, load the components from the relay (`<relay>/components/*.js`). Later, vendor a pinned bundle into the image so a relay deploy can't break member sites.

## Setup wizard (first boot)

On first boot, `/data/config.json` doesn't exist, so every request redirects to `/setup`. A one-time setup token is printed to the deploy logs, so a stranger who finds the URL first can't take over the site. If `ADMIN_PASSWORD` is set, the token step is skipped.

Steps:
1. Owner password (hashed with scrypt) and display name.
2. Site name and description.
3. Relay URL (default: octothorp.es). The site URL comes from `RAILWAY_PUBLIC_DOMAIN`, editable here.
4. Registration check with the relay (link out if needed, then "Check again").
5. Theme: accent colour and font from a few lewk presets.

## Customization tiers

1. **`/admin/settings`:** name, description, relay, colours, font, nav links.
2. **CSS:** `/data/theme/theme.css` overrides the default custom properties. It's editable from a textarea on the settings page.
3. **Templates:** "Eject theme" copies `layout.liquid`, `home.liquid`, and `post.liquid` into `/data/theme/`. Files there override the image's copies. Editing them needs either a file editor in `/admin` (later) or the Railway volume shell.
4. **Fork the repo:** full control, still deployable by the same template.

## Auth and security

- **Single owner account.** The session is an HttpOnly, Secure, SameSite=Strict cookie signed with a secret generated at setup and stored in `/data/config.json`.
- **Login rate limit:** 5 attempts per 15 minutes per IP.
- **All `/api` writes** require the session plus a CSRF token.
- **Sanitization:** body HTML is sanitized on the server whatever the editor sends.
- **Uploads:** checked against an allowlist (images, plus mp4/webm later) and size-capped.

## Export

`GET /admin/export` returns a zip containing:
- `/data/posts` and `/data/uploads`
- a static render of every page, harmonizer markup included

The static copy can be dropped on any static host; the owner can then re-index it under a new origin. This is the "you can always leave" guarantee, and it's also the OSS path for people who want static hosting.

## Railway packaging

- **Service:** one service, built from `Dockerfile`; `railway.json` follows the existing pattern in this repo.
- **Volume:** mounted at `/data`. The template must declare it; there's no data persistence without it.
- **Environment variables:**
  - `PORT` — provided by Railway.
  - `ADMIN_PASSWORD` — optional.
  - `RELAY_URL` — optional, defaults to octothorp.es.
  - No SPARQL variables.
- **Publishing:** publish through Railway's template composer, as described in section B of `docs/railway-deploy.md`.

## Spike plan

Goal: show that the save → index → social loop works end to end on Railway. Polish isn't the target.

1. **Server skeleton:** Hono, Liquid theme with `layout`/`home`/`post`, and posts read from `/data/posts`.
2. **Harmonizer contract:** render a fixture post and index it against a dev relay; confirm the stored blobject matches (title, date, terms, links).
3. **Auth:** the setup wizard with password only, then login and session.
4. **`<op-editor>`:** title, body, terms, and links with rel; save, sanitize, write, ping the relay, and show the result.
5. **Social components on post and home pages,** with `nopreload` and `server` set.
6. **Railway:** deploy from the template with a volume, redeploy, and confirm the posts survive.
7. **Two-site test:** deploy two member sites; site B replies to a post on site A; site A's `<octo-backlinks>` shows B's post.

Steps 1 to 7 passing is the spike's success criterion. Uploads, export, theme ejection, and previews are follow-ups unless they come cheaply.

## Open questions

- **Default relay:** octothorp.es by default with an editable field, or the relay chosen during setup with no default? (Pending your answer.)
- **Custom domains:** changing the domain changes every post's URI. Re-index under the new origin and leave the old records? Or does the relay need a "moved" mechanism?
- **Deletion:** the relay needs a route for an origin to delete its own pages before deletion is real.
- **Editor:** plain `contenteditable` vs Tiptap. Decide during spike step 4.
- **Component version pinning:** when does the image start vendoring its own bundle?
- **Shared code with the lite relay:** both use Hono + Liquid + the same theme conventions. Should the theme layer be a shared package?
