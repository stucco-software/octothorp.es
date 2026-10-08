---
name: octodemo
description: Create or update demo pages for the Octothorpes Protocol demo site (demo.ideastore.dev). Trigger when asked to "make a demo page for [feature]", "add a demo of [feature]", or when documenting a new OP feature for the demo site. Works from both the octodemo repo and the octothorp.es repo.
---

# Octodemo Site Skill

The octodemo site (`demo.ideastore.dev`) is a Jekyll site that demonstrates Octothorpes Protocol features with live, interactive examples. It is separate from the docs site (`docs.octothorp.es`), which handles technical documentation. The demo site focuses on showing features working, not explaining how to implement them.

## Output Path

Detect the working directory to determine where to write files:

- If `cwd` contains `octodemo`: write demo pages to `demos/` within the current repo
- Otherwise (e.g. working in `octothorp.es`): write demo pages to `/Users/nim/dev/octodemo/demos/`

Always use absolute paths when writing outside the current repo.

## devdemo is built from octodemo

The **devdemo** site (`https://nimdaghlian.github.io/devdemo/`, repo `~/dev/devdemo`) is not edited by hand. It is the build output of octodemo's **`development` branch**, using `_dev.yml` as the only config (title "OP DEV DEMO", `url` pointing at devdemo, `op-relay: https://next.octothorp.es/`). The user's shell alias `opddev`, run from `~/dev/octodemo`, does the build:

```
bundle exec jekyll build --config _dev.yml --destination ~/dev/devdemo/
```

- Write devdemo pages as markdown in `~/dev/octodemo/demos/` on the `development` branch. Never write or patch HTML in `~/dev/devdemo`.
- devdemo is the smoketest fixture site. Its pages index against next.octothorp.es, and the octothorp.es smoketest captures them. A new devdemo page is only indexed by the smoketest if its URL is added to `src/routes/debug/index-check/test-urls.yaml` in the octothorp.es repo, and adding pages changes the smoketest golden files (`npm run smoketest:check`, then `npm run smoketest:update`).
- Give every devdemo page a fixed `post_date`, so dates in the smoketest output stay deterministic.
- Building, committing and pushing devdemo publishes it on GitHub Pages. Pages lags a few minutes behind a push, so wait before re-indexing.

## Folder Structure

```
/                         ← root: site pages (index, about, quickstart, site-index, roadmap)
demos/                    ← feature demo pages
content/                  ← sample content pages used as demo data
test/                     ← internal test and utility pages
_includes/                ← Jekyll includes
_layouts/                 ← Jekyll layouts
```

## Standard Front Matter for Demo Pages

Feature demos use the `feature-demo` layout:

```yaml
---
layout: feature-demo
title: "Feature Name"
excerpt: "One or two sentences describing what this demo shows."
permalink: feature-name        # always set explicitly; never change existing permalinks
category: "Fundamentals"       # grouping on the index, e.g. Fundamentals, Querying
tags:                          # each tag is emitted as an octothorpe on the page
  - demo
  - relevant-term
version: "v0.7"                # optional; renders as a badge in the page header
post_date: "2026-10-07T12:00:00Z"  # optional; emitted as article:published_time
docs_url: "https://docs.octothorp.es/some-page/"  # optional; renders a docs link
---
```

## Demo Page Content Structure

The body is split by a `<!-- /// -->` line:

```markdown
Commentary: what the demo shows. Author handles the copy.

<!-- /// -->

<!-- Live markup. The layout renders it under "In action on this page" and
     shows the same markup escaped under "Raw HTML", so don't add a separate
     code snippet for it. -->
<a rel="octo:bookmarks" href="https://example.com/">A Bookmark</a>
```

Pages that aren't feature demos may still use `layout: default` with a live demo, then a code snippet, then an extended description.

## post-list.html Include

Use this include to display a list of OP-indexed posts:

```liquid
{% include post-list.html multipass='{"what":"pages","by":"thorped","o":"term"}' %}
```

The `multipass` param is a JSON string passed to the underlying web component. The component itself is TBD — the include is a stub. Use it for any list of posts so the component can be wired up in one place later.

## OP Server

This site connects to `https://octothorp.es/`. The `_includes/octocode.html` include handles indexing automatically on each page load — do not add indexing logic manually to demo pages.

## Permalink Rule

**Always set `permalink:` explicitly.** Never rely on Jekyll's default URL derivation from filename — filenames may change but URLs must stay stable. Never change an existing permalink.

## Naming Conventions

- Demo page filenames: lowercase, hyphenated (e.g. `badge-indexing.md`)
- Permalink matches filename without extension (e.g. `permalink: badge-indexing`)
- Release-tagged pages include `version: "v0.7"` (or current release) in front matter

## When Creating a New Demo Page

1. Determine the correct output path (see Output Path above)
2. Create the file in `demos/` with the standard front matter
3. Add a live demo section (stub with a comment if the demo isn't ready)
4. Add a code snippet if the feature requires markup the user would copy
5. Leave body copy as a comment placeholder — the author handles copywriting
6. Do not add the page to `site-index.md` — the author updates navigation manually

## What This Skill Does Not Cover

- Copywriting or prose for demo pages (author handles this)
- Layout or CSS changes
- OP protocol internals (see the octothorpes skill for that)
- Updating `site-index.md` or navigation
