---
name: op-docs-voice
description: How to write OP documentation prose. Loaded from documentation.md when the user asks to draft or write docs (as opposed to stub or scaffold them). Contains the mode gate, the draft label, markup verification, the reading list, and a gallery of real edits the author made to Claude-written docs.
---

# OP Documentation Voice

This file governs **prose**. `documentation.md` governs structure, front matter, paths, and the handoff pipeline. Read that one first; this one takes over at the point where words get written.

---

## 1. Mode gate

Two modes. **The user's verb selects the mode. Claude does not choose.**

| The user says | Mode | What you do |
|---|---|---|
| stub, scaffold, set up, placeholder, rough in | **Scaffold** | `documentation.md` rules stand exactly as written. Front matter, verified code examples, verified parameter tables, `<!-- TODO: write copy -->`. **No prose.** |
| draft, write, take a pass at, fill in, rewrite | **Draft** | Full prose under this file. Pick the page kind (§2), label it (§3), read the list (§6) first. |

If the ask is ambiguous, **default to Scaffold** and say so in one line: *"Scaffolding this — say 'draft it' if you want prose."*

Cheaper to be asked for more than to smuggle prose into something that was supposed to be an outline.

---

## 2. Page kind

A page serves **one** of three readers. Never two. Mixing "here's how to use it" with "here's how to build your own" on one page means neither reader can skim it.

| Kind | Reader | Nav position |
|---|---|---|
| **use** | Wants to consume the feature someone else built. | Parent page. No `parent:` in front matter. |
| **reference** | Knows what it is, needs the exhaustive table of attributes / params / fields. | Child. `parent: <Use page key>`, permalink nested under it. |
| **build** | Wants to author or extend the feature, usually running their own relay. | Child. `parent: <Use page key>`, permalink nested under it. |

This is not an invention — it is what the docs site already does. `web-components.md` is the **use** page; `component-reference.md` and `build-components.md` are its children, both with `parent: Web Components`, at `web-components/components/` and `web-components/building/`. Match that shape.

**If the user names a kind** ("write the publishers *use* page," "the *build* page"), write that one only.

**If the user does not**, say which kinds the feature needs in one line before drafting — *"This splits into a use page and a build page; starting with use."* — draft the use page, then ask before doing the others. Do not draft all three unprompted, and do not fold them together to avoid the question.

A feature with no author-facing surface is just a use page. Not every feature splits.

---

## 3. The draft label

Every page written in Draft mode opens with this block, before the content and after the front matter:

```markdown
> ## ⚠ UNREVIEWED CLAUDE DRAFT
> Written by Claude, not yet edited by a human. Delete this block before publishing.
```

**It renders. That is the point.** An HTML comment hides in source and ships by accident; a blockquote with a heading in it is impossible to miss in a built page or a preview.

There is a specific reason this matters more here than on most projects. `integration-guide.md` says, publicly, on the live docs site:

> **None of this uses an LLM** -- OP is just javascript. A human wrote this guide.

Unlabeled Claude prose reaching docs.octothorp.es makes that sentence false. The label is what keeps the claim honest between drafting and editing. Do not omit it, do not shrink it to a comment, and do not remove it yourself — removing it is the author's signal that they have read and taken ownership of the words.

---

## 4. Write it as shipped

Documentation describes the feature as a reader will meet it: **live, public, and usable today**. It does not track deployment.

- Write every example URL against the public relay -- `https://octothorp.es/...` -- whatever you tested against.
- Never mention `next.octothorp.es`, `development`, `main`, branches, or which server currently has what.
- No "this is coming in v0.7," no "available on the development server," no "once this ships."

If a feature is not on the public relay yet, that is a **publishing-date** question for the author, not a caveat for the reader. Write the page as though the feature is live and say so in your report back to the user. They decide when the page goes up; you do not hedge the prose on their behalf.

This applies only to prose. Verification still runs against wherever the code actually is (§5).

---

## 5. Pre-flight: verify the markup before writing a word

Before drafting, confirm every one of these against the source:

- `rel` / `rev` values and which one is actually the mechanism
- attribute names, element names, and where the element goes (`<head>` vs body)
- endpoint paths and query parameter names
- web component tag names and their attributes

Check in this order: the reference files in `.claude/skills/octothorpes/` (`api-reference.md`, `harmonizers.md`, `handlers.md`, `publishers.md`, `web-components.md`), then `packages/core/` directly.

**Why this is section three and not a footnote.** A previous Claude draft of `backlinks.md` taught this as the way to endorse an incoming link:

```html
<link rev="octo:octothorpes" href="https://originating-site.com">
```

The actual mechanism is `rel="octo:endorses"`. `rev` is a supported curiosity, not the answer. The prose around it was clean, confident, and well-formatted — which is exactly why nothing in a style guide caught it. **Correct-sounding wrong markup is the worst failure available to you here**, because it sends a reader to debug something that was never going to work.

Never infer markup from an existing docs page. Pages go stale; that is how the error above survived to be published.

**Verify against the development deploy** (`next.octothorp.es`) or a local dev server, since that is where unshipped features actually run. Then write the examples as `octothorp.es` per §4. Checking against production will make a shipped-but-not-yet-deployed feature look broken.

**Check the code, not the reference file, for anything about request syntax.** Reference files use loose notation; routes are the truth.

The case that proves it: `publishers.md` and a `load.js` comment both wrote the publisher selector as `?as=<name>`. It has never worked -- `load.js` destructures `as` from route `params`, so `?as=rss` silently returns plain JSON.

The name itself was never the problem. `as` deliberately means the same thing everywhere in OP -- *give me this as X* -- and is used for the harmonizer on indexing requests and the publisher on `/get/`. What the docs got wrong was its **position**: a query param on indexing requests, the final path segment on `/get/`, which puts all its arguments in the path.

That is the shape of this error generally. A name that is reused on purpose reads as interchangeable, and the syntax quietly is not. Both sources are corrected now, which is exactly why you cannot rely on them staying correct: when a doc and a route disagree, the route wins.

---

## 6. Reading list — Draft mode only

Before writing prose, read these three **in full**, in `/Users/nim/dev/doctothorpes/`:

- `integration-guide.md` — the pitch register
- `quickstart.md` — the tutorial register
- `get-indexed.md` — the reference register

All three are the author's own unedited writing. Read whole documents, not excerpts: the thing to absorb is how a page *moves* — where it stops explaining, when it drops a joke, how fast it gets to the markup — and that does not survive being quoted in fragments.

Do not read these in Scaffold mode. Skip them for a one-paragraph edit.

---

## 7. The gallery

Real edits the author made to Claude-written docs. Left column is what Claude wrote; right is what the author replaced it with. Commits: `eaf3b10`, `a8dc099`, `2e1ef0f` in `doctothorpes`.

Match the right column.

---

### Restatement tail

> **Claude:** A backlink is a link both sites know about. When your page links to another and that page acknowledges it, the connection is two-way — both sides can display and query it.

> **Author:** A backlink is a link both sites know about. When your page links to another and that page acknowledges it, that's a backlink.

The second half of Claude's sentence explains the first half again in more general vocabulary. Once the thing is said, stop.

---

### The unrequested analogy

> **Claude,** second paragraph of `backlinks.md`: Hashtags work this way on closed platforms: tagging a post links it to a tag page that aggregates all posts with that tag. OP backlinks work the same way without the middleman. You link to a page, that page knows you linked to it, and any OP server connected to both can reflect that relationship.

> **Author:** *(deleted entirely)*

Note what did **not** happen: the same closed-platform analogy survives in `hashtags.md`, because that is the doc about hashtags. An analogy earns its place once, in the page about the thing it explains. Everywhere else it is padding that makes the reader do a comparison they did not ask for.

---

### Capability vs. consequence

> **Claude:** Once that's in place, OP servers register the relationship. The target site can then query any connected OP server for backlinks to its pages and display them however it wants.

> **Author:** Once that's in place, incoming links from that domain will automatically turn into backlinks. Then people looking at queries about _your_ site will see that you're linked to them, even if you didn't write a link yourself.

Claude describes what the system permits. The author describes what the reader will observe. Write the second one.

---

### Principle vs. reason

> **Claude:** Registering a backlink on your end doesn't complete the relationship on its own — the target site has to endorse it. This is intentional: no one gets silently linked to without consent.

> **Author:** Making a backlink on your end doesn't complete the relationship on its own — the target site has to agree to it. This is on purpose -- we track all kinds of links you send us, but backlinks _must_ be two ways.

Asked *why*, Claude reaches for a value. The author gives the mechanical fact, and the value is left implied by it. OP has strong principles and the docs almost never state them directly — see how the ethos gets handled in `integration-guide.md`, as a short bulleted aside at the bottom, not as the frame around every feature.

---

### Roadmap sections

> **Claude:**
> ```markdown
> ## Current limits
>
> Endorsement currently works at the domain level. Endorsing `originating-site.com`
> endorses all pages from that domain. Finer-grained moderation controls are planned.
> ```

> **Author:** Note that endorsement currently only works at the domain level. Endorsing `originating-site.com` endorses all pages from that domain.

The heading goes, the promise goes, the fact stays as one inline note. No `## Current limits`, no `## Limitations`, no "coming in a future version." A limit is a fact about the thing; it does not need its own furniture, and the docs do not commit the project to a roadmap.

---

### The apologetic placeholder

> **Claude,** closing `hashtags.md`: *More detail coming. For now, see [Getting Started](/getting-started/) for a walkthrough of how to add your first octothorpes.*

> **Author:** For more, see [the documentation for adding octothorpes to your page](https://docs.octothorp.es/make-statements/#octothorpes)

Documentation does not apologize for itself. If there is somewhere else to send the reader, send them; if there is not, end. Never write "more detail coming," "this section is a work in progress," or "for now."

---

### Inert vs. live

> **Claude:** *(prose only — nothing on the page did anything)*

> **Author,** mid-paragraph in `backlinks.md`:
> ```markdown
> The first way to make one is pretty obvious -- link back to the person to who
> linked to you! <a rel="octo:octothorpes" href="https://demo.ideastore.dev/backlinked-page">This is a backlink now.</a>
> ```

> **Author,** first sentence of `hashtags.md`:
> ```markdown
> An octothorpe is a distributed hashtag. When you octothorpe a webpage, like this:
> <octo-thorpe>demo</octo-thorpe>, you link that page to that _tag as a concept_.
> ```

The docs site is an OP client. A page about a feature should **use** the feature, inline, in the sentence that introduces it — not in a fenced "Example" section at the bottom. When drafting any page for a feature that can demonstrate itself, place the live component or the real working link in the body and let the sentence run through it.

---

### Register

> **Claude:** Webring membership is a natural application of backlinks. Linking to a webring page with `rel="octo:octothorpes"` registers your site as a member. […] If the webring page endorses incoming links, it can query its OP server for all backlinks to that URL and display its member list dynamically — no manual roster to maintain.

> **Author:** You can join a webring with a backlink! If you are backlinked to the home page of a Webring, then you're a member! [Read more here!](/webrings/)

Second person. Exclamations where something is genuinely good news. Four times shorter. "A natural application of" is the exact species of phrase to hunt.

---

### Asides and project voice

> **Claude:** `rev` is a deprecated HTML attribute originally proposed to denote reverse links. OP brings it back deliberately — it's the right semantic fit for this use case.

> **Author:** For nerdy fun, you can use `rev` […] `rev` is an [obsolete](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/link#rev) part of HTML spec originally proposed to denote a reverse link. We think it's a good idea, so we're bringing it back.

Three things at once: the aside is flagged as optional fun rather than presented as the mechanism, the claim is linked to a source, and the project speaks as **we** with an opinion — "we think it's a good idea" — instead of as an impersonal system making correct decisions.

---

## 8. Mechanics

Small and consistent across the author's writing:

- `--` for an em-dash-ish break far more often than `—`. Both appear; when in doubt use `--`.
- `_underscores_` for emphasis, not `**bold**`, inside body prose.
- Plain verbs. "use," not "stack" / "leverage" / "employ." Verb inflation is the most frequent single edit and never survives.
- Second person for the reader, first-person plural for the project.
- Sentence-case headings, short, often a question or an imperative.

---

## 9. Cut pass

Run against the finished draft before showing it. Delete unless it earns its place:

- [ ] Any sentence or clause that restates the one before it in more general terms
- [ ] Any analogy that is not in the page about the thing it explains
- [ ] Any sentence describing what the system *can do* rather than what the reader *will see*
- [ ] Any appeal to a principle where a mechanical reason is available
- [ ] Any `## Current limits` / `## Limitations` heading — fold to an inline note
- [ ] Any promise about a future version
- [ ] Any "more detail coming," "work in progress," "for now"
- [ ] Any inflated verb
- [ ] Any concluding paragraph that summarizes the page it is at the bottom of

Then confirm, positively:

- [ ] Markup verified against `packages/core/` or the skill reference files — not copied from another docs page
- [ ] At least one live component or real working link in the body, if the feature can demonstrate itself
- [ ] The `⚠ UNREVIEWED CLAUDE DRAFT` banner is present
- [ ] Every example URL is `octothorp.es`, and no branch or deploy target is named anywhere
- [ ] The page serves one reader -- use, reference, or build -- and does not drift into another
