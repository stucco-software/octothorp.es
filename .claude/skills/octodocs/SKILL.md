---
name: octodocs
description: Use when writing or scaffolding documentation pages for docs.octothorp.es. Triggers on "document this feature", "write docs for X", "add a docs page", or when creating documentation alongside a demo page.
---

# OP Docs Skill

The docs site lives at `/Users/nim/dev/doctothorpes`. It's an Eleventy site using the LibDoc theme with the `eleventyNavigation` plugin for sidebar nav.

**Always write to `/Users/nim/dev/doctothorpes/`.** Never write docs into the octothorp.es repo.

## Frontmatter

```yaml
---
title: Page Title
description: One sentence, no period at end
layout: octo_page.html
permalink: section-name/index.html
eleventyNavigation:
  key: Nav Label
  order: N
  parent: Parent Key   # omit for top-level pages
date: git Last Modified
tags:
---
```

### Nav order reference

| Section | Order |
|---------|-------|
| Getting Started | 2 |
| API Documentation | 3 |
| Harmonizers | 4 |
| Concepts | 6 |

New top-level sections go at an order that fits logically between existing ones.

### Permalink conventions

- Top-level: `{slug}/index.html`
- Sub-page: `{parent-slug}/{child-slug}/index.html`

File path mirrors permalink: `getting-started/get-indexed/index.md` → `permalink: getting-started/get-indexed/index.html`

## File structure

```
doctothorpes/
  {section}/
    index.md               ← section landing page
    {sub-page}/
      index.md
```

Root-level standalone `.md` files are fine for reference docs that don't need sub-pages.

## Scaffolding approach

Create the file with:
1. Correct frontmatter
2. Section headings that match the expected content shape
3. One-line HTML comments as placeholders where the user should write prose

Don't write body prose — the user finishes it. Do include code examples, attribute tables, and API references that can be derived from the codebase.

Example scaffold for a component reference page:

```markdown
---
title: Web Components
description: Drop-in web components for displaying OP data on any page
layout: octo_page.html
permalink: web-components/index.html
eleventyNavigation:
  key: Web Components
  order: 5
date: git Last Modified
tags:
---

<!-- Overview: what these are and why you'd use them -->

## `<octo-thorpe>`

<!-- One sentence: what it shows -->

**Usage:**
```html
<script type="module" src="https://octothorp.es/components/octo-thorpe.js"></script>
<octo-thorpe o="your-term" autoload></octo-thorpe>
```

| Attribute | Description |
|-----------|-------------|
| `o` | ... |
```

## Style guidance

Write for developers who've already decided to read this page. Skip the wind-up.

- Short sentences. Cut hedging.
- Sentence case headings, always.
- One concept per section.
- Tables for reference material (attributes, params, errors).
- Code examples: complete and copyable, not illustrative sketches.
- Don't sell OP — they already clicked.

## Demo site relationship

Demo pages at `demo.ideastore.dev` link to docs via `docs_url` in their frontmatter. Demo files live in `/Users/nim/dev/octodemo/demos/`.

When scaffolding a docs page for a feature:
1. Check `/Users/nim/dev/octodemo/demos/` for a matching demo page.
2. If one exists, note its permalink — the user should add `docs_url: https://docs.octothorp.es/{permalink}` to that demo page's frontmatter.
3. If none exists, mention it — a demo page may be worth creating with the octodemo skill.

When using the octodemo skill to create a demo page, check for a matching docs page to link.
