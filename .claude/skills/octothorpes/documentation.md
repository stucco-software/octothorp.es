---
name: op-docs
description: Create or update demo pages and documentation for the Octothorpe Protocol. Trigger when asked to "make a demo page for [feature]", when a handoff document is loaded to begin a docs session, or when asked to "let's write docs for OP". Works from any repo context.
---

# OP Documentation Skill

Handles the full documentation pipeline for Octothorpe Protocol across two sites:

- **Demo site** (`demo.ideastore.dev`): Jekyll, repo at `/Users/nim/dev/octodemo/`
- **Docs site** (`docs.octothorp.es`): Eleventy/libdoc, repo at `/Users/nim/dev/doctothorpes/`

---

## Session Startup Checklist

Run this before touching any files. No exceptions.

```bash
git -C /Users/nim/dev/octodemo branch --show-current
git -C /Users/nim/dev/doctothorpes branch --show-current
```

- If either repo is **not** on `development`: **hard stop.** Tell the user which repo is on the wrong branch and ask them to switch. Do not proceed until both are confirmed on `development`.
- If both are on `development`: continue unimpeded.

---

## Triggers

- **"make a demo page for X"** → run checklist, then create a demo page only (see Demo Page section)
- **Handoff document loaded** → run checklist, then begin Review Dialogue (see Handoff & Review section)
- **"let's write docs for OP"** → run checklist, then ask the user which handoff document to load

---

## Handoff & Review

### When to create a handoff note

At the end of an implementation session, after a wave or feature set lands on `development`, create a handoff note at:

```
docs/plans/point7/wave-N-docs-handoff.md
```

in the main `octothorp.es` repo. This is the only artifact the docs session needs.

### Handoff note template

```markdown
# Wave N — Docs Handoff

**Wave:** N
**Delivered:** YYYY-MM-DD
**Branch:** development

## Delivered Features

| Feature | Issue | Plan Doc |
|---------|-------|----------|
| Feature name | #xxx | `docs/plans/point7/filename.md` |

## Documentation Candidates

| Feature | Docs page? | Demo page? | Notes |
|---------|------------|------------|-------|
| Feature name | TBD | TBD | |

## Technical Material

### Feature Name

- **API params:** (list any new or changed query params with types and descriptions)
- **Markup example:** (copy from plan/issue)
- **Notes:** (anything non-obvious that the docs author needs to know)
```

Leave `Docs page?` and `Demo page?` as `TBD` — these are decided in the Review Dialogue, not during implementation.

### Review Dialogue

Triggered when the user loads a handoff document into a session.

1. Read the handoff document.
2. For each `TBD` candidate, present it briefly and ask: **docs page, demo page, both, or neither?** State your recommendation and rationale in one sentence; let the user decide.
3. Fill in the table with the approved decisions.
4. Proceed to scaffold only the approved pages.

Do not scaffold any pages before the review is complete.

---

## Demo Page Creation

### Output path

Always write demo pages to `/Users/nim/dev/octodemo/demos/` using the absolute path, regardless of working directory.

### Front matter

```yaml
---
layout: default
title: "Feature Name"
excerpt: "One or two sentences describing what this demo shows."
permalink: feature-name        # always set explicitly; never change existing permalinks
tags:
  - demo
  - relevant-term
version: "v0.7"                # include when tied to a specific release
docs_url: "https://docs.octothorp.es/feature-name/"  # cross-link placeholder
---
```

- `version` renders as a small badge in the page header automatically
- `docs_url` renders as a "Read the docs →" link in the page header automatically

### Content order

```
1. Live demo (web component, embedded result, or interactive element)
2. Code snippet (only if there's something worth copying)
3. Extended description (only if the demo isn't self-evident)
```

Example live demo include:
```liquid
{% include post-list.html multipass='{"what":"pages","by":"thorped","o":"term"}' %}
```

Leave body copy as `<!-- TODO: write copy -->` comment placeholders. Do not write prose.

### Permalink rule

Always set `permalink:` explicitly. Filenames may change but URLs must stay stable. Never change an existing permalink. Filenames: lowercase, hyphenated.

### What not to do

- Do not add the page to `site-index.md` — the author updates navigation manually
- Do not write prose or copywriting
- Do not add indexing logic — `_includes/octocode.html` handles this automatically

---

## Full Docs Prep

Triggered after review dialogue approves a feature for both docs and demo pages.

Takes technical material from the handoff note (or a plan document / GitHub issue) as input.

### Steps

1. Scaffold a docs page in `/Users/nim/dev/doctothorpes/`
2. Create or update the corresponding demo page in `/Users/nim/dev/octodemo/demos/`
3. Add `docs_url` to demo front matter pointing to the docs page
4. Add `demo_url` to docs front matter pointing to the demo page

### Docs page front matter

```yaml
---
title: "Feature Name"
description:
layout: octo_page.html
permalink: feature-name/index.html
eleventyNavigation:
  key: Feature Name
  order:
date: git Last Modified
tags:
demo_url: "https://demo.ideastore.dev/feature-name"
---
```

### Docs page content structure (scaffold only)

```markdown
## Overview

<!-- TODO: write copy -->

## Usage

<!-- Technical summary of how to use the feature, drawn from plan/issue -->

### Markup

<!-- code example from plan/issue -->

## API Reference

<!-- If the feature has API parameters, list them here with types and descriptions from plan/issue -->

## Notes

<!-- TODO: write copy -->
```

Leave all prose sections as `<!-- TODO: write copy -->`. Only fill in technical content (code examples, parameter names, types) that exists in the source plan or issue.

### What not to do

- Do not write prose or copywriting
- Do not update `eleventyNavigation.order` — the author sets navigation order manually
- Do not update any index or navigation files

---

## OP Cross-Linking Convention

Both demo and docs pages for a feature should eventually backlink each other with `rel="octo:octothorpes"`. The `docs_url` and `demo_url` front matter fields are placeholders for the author to wire up later. Technical implementation of cross-links is handled separately.

---

## OP Server

The demo site connects to `https://octothorp.es/`. Do not add indexing logic to demo pages manually.
