# v0.7 tracker restructure: epic-based tracking, drop wave labels

**Status:** planned, not started. Write-up only — no issues filed, no labels touched, no tracker file edited yet.
**Handoff note:** this doc is meant to be picked up cold in a new session. It contains the decisions already made, the source material to work from, and the concrete steps. Don't re-litigate the decisions in "Locked decisions" — those are settled. Everything else is open to the executing agent's judgment.

## Background

`docs/plans/point7/v07-tracker.md` (the original tracker) tried to be both a dashboard and an archive — every line carries commit hashes, verification dates, before/after numbers, and design rationale. It's grown too long to serve as an at-a-glance status check, which was its whole job.

The user started a replacement, `docs/plans/point7/v07 Tracker for Humans.md` (note the space in the filename — rename it as part of this work, e.g. `v07-tracker-human.md`), with a different philosophy: short, casual, named by subject area instead of wave number, `Status` + `Issues`/`TODO` per section, no evidence trail. That detail — verification steps, root-cause writeups, before/after numbers — moves to GitHub issue comments and/or the release notes file (`docs/plans/point7/release notes/release-notes-development.md`), whichever fits in the moment. No fixed rule between the two.

The open design question was how to group sections. The user's answer: **drop wave numbers entirely, group by epic.** `#215` ("OP Client Profile (epic)") is the reference shape — title suffix `(epic)`, a body with a design summary and a list of sub-issue numbers, `Related` links to adjacent issues. GitHub's native sub-issue linking (`gh api repos/.../issues/N/sub_issues`) is NOT in use anywhere in this repo (checked: returns empty for #215) — the convention is plain issue-number references in the body text. Follow that convention, don't try to wire up native sub-issues.

Four issues currently read as epics by title: `#215` (open), `#218` "Domain Pages Overhaul (epic)" (open), `#264` "Epic: Improve Smoketests" (closed), `#240` "Epic: Memex MVP" (closed). Note the inconsistent prefix/suffix style (`(epic)` suffix vs `Epic:` prefix) — standardize on **`(epic)` suffix**, matching `#215` and `#218`, since those are the two currently-open ones and the ones this work extends.

## Locked decisions (do not re-ask)

1. **File epic issues for all five under-epic'd sections now**: RDF-Star relationship model migration, Deletion, Publishers, Handlers, Batch Indexing. (Full body drafts are below — mostly just need `gh issue create`, adjust if source material has moved on.)
2. **Delete the `wave/0` through `wave/7` labels from the GitHub repo entirely** (`gh label delete wave/N` for each), not just stop using them. This strips the label from every issue automatically. This is a one-way action on GitHub (labels aren't trivially restorable with their prior issue associations) — confirm current usage with `gh issue list --label wave/N` before deleting each one, in case something's changed since 2026-08-17, but do not go back to the user to re-confirm the decision itself.

## What "epic-based" means going forward

- **Section headers in the human tracker = epic issue titles** (without the `(epic)` suffix, e.g. "OP Client Profile and Vocabulary", "RDF-Star Relationship Model Migration").
- Not every section needs to be an epic. Buckets like `Bug Fixes`, `UI`, `API Additions`, `Untracked`, and the `Memex-specific sub-group` audit list are legitimately non-epic — miscellaneous or too-small-to-design-around. Keep those as informal sections; don't force-file epics for them.
- An issue's relationship to an epic lives in the epic's body (a list of issue numbers), not in a GitHub label. No `epic/215`-style label — that would just reinvent the wave-label problem with extra steps.

## Step 1 — File the five epic issues

Use `gh issue create --title "... (epic)" --milestone "v 0.7" --body "..."`. Keep labels minimal and topical (reuse existing labels: `enhancement`, `Indexing`, `Vocabulary`, `API`, `UI`, `Publishers` as appropriate) — do not invent new labels for this.

Source material for each is the corresponding section of the OLD tracker (`docs/plans/point7/v07-tracker.md`, current state as of this plan) plus any plan docs it references. Draft bodies below; adjust for anything that's changed since this was written.

### 1. RDF-Star relationship model migration (epic)

**Why this one matters most:** it's the project's stated critical path (blocks Deletion) and currently has zero GitHub representation — the most invisible piece of real, planned work in the milestone.

Source: old tracker's "Wave 4a" section, plus design docs `docs/plans/point7/2026-07-02-231-relationship-model-rdfstar.md` and `docs/plans/point7/2026-07-06-jsonld-graph-model-and-terms.md` §8.

Suggested body:

```
## Epic: RDF-Star Relationship Model Migration

Collapses the current dual relationship-storage model (flat `<s> <o> <timestamp>` facts + blank-node-reified typed links via `backlinkTriples`) into RDF-star quoted triples: `<< <s> octo:octothorpes <o> >> octo:type octo:X ; octo:created <ts> ; ...`. Statement metadata (type, creation time, term) hangs off the base triple instead of living in two incompatible shapes.

**Why:** deletion SPARQL (see #248) is relationship-model-specific and should be written once, against the final model — not against the current model and then rewritten. This migration is therefore a hard prerequisite for the Deletion epic, not parallel work.

Design docs:
- docs/plans/point7/2026-07-02-231-relationship-model-rdfstar.md
- docs/plans/point7/2026-07-06-jsonld-graph-model-and-terms.md (§8)

## Sequencing

After epic #240 (Memex MVP, shipped) — the migration must assert base triples, which Memex backlinks/Collections depend on; this was locked during #240's design. Before the Deletion epic.

## Scope

**Precursors** (cheap, additive, can land independently, in any order):
- #231 — derive backlinks instead of storing the reciprocal switch; this issue IS this task
- @id -> uri rename / identifier-key consistency (needs its own issue — file when picked up)
- octo:Term rdfs:subClassOf skos:Concept + skos:prefLabel (needs its own issue — file when picked up)

**Migration proper:**
- RDF-star statement-metadata migration itself — rewrites queryBuilders.js + getBlobjectFromResponse blank-node patterns (needs its own issue — file when picked up)
- #268 — octo:created on relationships (statement-level creation time, retires the `<s> <o> <ts>` predicate-as-object-URI pattern). Carries a read-path constraint: parseBindings currently derives object-row dates from `?s ?o ?date` (see commit 75e3750) — that binding must keep working or migrate in the same change, or RSS link feeds go empty again.
- #192 — Content labels (moved here from the old Wave 2 grouping; labels are structurally relationships-with-metadata, so they ride on this migration rather than shipping as a parallel mechanism)
- Re-verify subtype paths (#236 behavior) + relationship-terms queries on the new model (needs its own issue)
- Data migration for existing stores: blank nodes -> quoted triples, plus the `<s> <o> <ts>` flat facts per #268 (needs its own issue)
- JSON-LD publisher endpoint (URL + MultiPass @graph) — same design doc, can bundle or follow (needs its own issue)
- context.json regeneration — deliberately waits on this epic (RDF-star serialization was the open design point); coordinate with #195

## Related

- #248 (Deletion epic) — blocked by this
- #195 (canonical vocabulary cleanup) — context.json regeneration coordinates with this
- #240 (Memex MVP, closed) — precedes this; base-triple assertion requirement locked there
```

Milestone: v 0.7. Labels: `Vocabulary`, `Indexing`, `enhancement`.

After filing, note the new issue number and **add it to #231, #268, #192 as a "Related" or "Part of" reference** (edit those issue bodies or add a comment) so the epic is discoverable from its own sub-issues, not just the other direction.

### 2. Deletion (epic)

Source: old tracker's "Wave 5" section.

Suggested body:

```
## Epic: Deletion

Unified handling for removing data from the graph: statements that vanish when a page changes, pages that 404 or otherwise disappear, and a single semantics table for what "deleted" means on read.

**Depends on the RDF-Star Relationship Model Migration epic** — all deletion SPARQL is relationship-model-specific and should be written once, against the final model.

## Scope

- #248 — Unified deletion module: absorb packages/core/delete.js into createDeleter, one semantics table, client.deleter/deleteSource surface. Blocker for the rest of this epic. Two open decisions: inbound refs on hard delete; read-side meaning of soft-delete.
- #26 — Delete statements when removed from a page. Plan: docs/plans/point7/2026-05-19-stale-statement-removal-26.md
- #167 — Archive/soft-delete 404 URLs. Design: docs/plans/point7/2026-03-30-page-deletion.md

Sequence: RDF-Star migration -> #248 -> #26 -> #167.

## Related

- RDF-Star Relationship Model Migration epic (blocks this)
```

Milestone: v 0.7. Labels: `Indexing`, `enhancement`.

### 3. Publishers (epic)

Source: old tracker's "Wave 0b" section (mostly closed-out already — check current issue states before filing, since #225 and others may have moved since this plan was written).

Suggested body:

```
## Epic: Publishers

The output side of OP: a registry of schema-driven transforms (RSS, ATProto site.standard.document, Bluesky posts, iCalendar) that turn query results into a target format. Core is implemented (packages/core/publishers.js registry, packages/core/publish.js transform engine); what's left is closing out documentation and a couple of open publisher implementations.

## Scope

- Public docs page for the Publisher system on docs.octothorp.es (concept, schema shape, how to add one, site-defined-vs-programmatic path)
- Append Publishers MVP release notes (if not already done — check release-notes-development.md)
- #227 — site-defined `readable` publisher (Readability.js extraction). Check status: a `src/lib/publishers/readable/` directory with a resolver+renderer already exists as of 2026-08-12; verify whether this is complete or still needs the calendar-test-style coverage.
- #226 — site-defined ICS publisher (filter to octo:type=event, use postDate). Core already ships a general-purpose `ics` publisher in packages/core/publishers.js with test coverage; determine whether that satisfies this issue or whether a site-defined variant is still wanted, and close or narrow accordingly.
- #250 — Publisher profile-compat check (optional typed cross-client compatibility handshake). Deferred, lower priority within this epic.

## Related

- #161 (Publishers MVP, if still open — likely closeable once docs land)
```

Milestone: v 0.7. Labels: `Publishers`, `enhancement`.

### 4. Handlers (epic)

Source: old tracker's "Wave 0a" section. This work is code-complete per the old tracker; the epic here is mostly a closeout/docs wrapper, check whether it's worth filing as a formal epic or just folding into a "Publishers" or general Wave-0-closeout TODO in the human tracker instead. If filing:

```
## Epic: Handlers

The input side of OP: a pluggable, content-type-agnostic pipeline (packages/core/handlerRegistry.js + handlers/*) that dispatches raw content to the right harmonizer. Code-complete; the generic pipeline (resolveIndexPolicy + dispatch) and live-endpoint wiring both landed. What's left is documentation and demo coverage.

Plan: docs/plans/point7/handlers/2026-03-19-handler-harmonizer-plan.md
Docs handoff already written: docs/plans/point7/wave-0a-docs-handoff.md

## Scope

- Write basic documentation (docs.octothorp.es)
- Add example demos to the demo site
- Re-test demos
- Add demos to smoketest

## Related

- Publishers epic (sibling closeout, same "docs + demos" shape)
```

Milestone: v 0.7. Labels: `Indexing`, `enhancement`.

### 5. Batch Indexing (epic)

Source: old tracker's "Wave 3" section.

Suggested body:

```
## Epic: Batch Indexing

Indexing more than one URL/document per request, with whole-set options (documentRecordSchema, reconcile, wikilinkTargets) that only make sense at batch scope.

Depends on the Handlers epic being complete (batch needs direct handler dispatch, ingestBlobject callable directly) — check that dependency still holds before starting.
Plan: docs/plans/point7/180-batch-indexing-mvp.md (spec-revised 2026-07-09)

## Scope

- #180 — Batch Indexing MVP
- #43 — Index statements via an Octothorpes blobject file. Materially closer than "deferred": the blobject handler + indexSource({ content }) direct-write path already ship; only the HTTP-batch dispatch branch is missing. Recommend folding into #180's implementation rather than doing standalone.
- #177 — Harmonize standard sitemap.xml files. Depends on #180.
- #267 — Optimize the update method on re-index. Same write path as batch; the #262/#265 timeout episode (a 110-link page wedging mid-write, prod function timeout raised to 5 min) is the motivating case.

## Related

- Handlers epic (dependency)
```

Milestone: v 0.7. Labels: `Indexing`, `enhancement`.

## Step 2 — Delete the wave labels

For each of `wave/0` through `wave/7`:

1. `gh issue list --label wave/N --state all --json number,title` — sanity check what's currently on it, in case anything changed since 2026-08-17.
2. `gh label delete wave/N --yes` (repo: `stucco-software/octothorp.es`). This removes the label from every issue automatically; no need to manually strip it issue-by-issue first.

Do this AFTER filing the five epics above and cross-linking issues into them (Step 1), so nothing depends on wave labels for grouping by the time they're gone. Do not delete `Bug`, `API`, `UI`, `Servers`, `Vocabulary`, `Publishers`, `Indexing`, `Ambition`, `chore`, `enhancement`, `review`, `On Hold` — those are topical/type labels, not wave labels, and are out of scope for this change.

## Step 3 — Rewrite the human tracker

File: rename `docs/plans/point7/v07 Tracker for Humans.md` to `docs/plans/point7/v07-tracker-human.md` (drop the space; matches the kebab-case convention every other doc in this directory uses).

Keep the existing style exactly: short `Status` line(s) per section in plain language, `Issues` as bare issue numbers with a terse human gloss (a sub-bullet only for a genuinely open question or action item), `TODO` as a short checklist. No commit hashes, no verification dates, no design rationale, no links to plan docs inline (the epic issue is where that lives now).

Section list, in epic-issue order followed by non-epic buckets:

1. **OP Client Profile and Vocabulary** — already drafted by the user, keep as-is, just re-check the issue list against current state (#235, #269, #216, #217, #236) since some of this may have moved.
2. **RDF-Star Relationship Model Migration** — new section for the new epic; Status should say something like "Not started. Critical path — blocks Deletion." Issues: list the new epic number + #231, #268, #192 at minimum.
3. **Deletion** — new section; Status "Not started, blocked on RDF-Star migration." Issues: new epic number + #248, #26, #167.
4. **Publishers** — user already drafted a generic Status/TODO block; replace/merge with the new epic's issue list (#227, #226, #250) once filed.
5. **Handlers** — same treatment as Publishers.
6. **Batch Indexing** — new section; Issues: new epic number + #180, #43, #177, #267.
7. **Bug Fixes** — keep as a non-epic bucket. User already drafted a generic Status/TODO here; this is fine as-is, it's meant to be a catch-all, not tied to a single epic.
8. **UI** — non-epic bucket. Populate from old tracker's Wave 6 (#158, #199, #254, plus the un-issued "lewk.css layout system", "ui for /discover", "route legacy RSS endpoints" items) and Wave 7's Domain Pages Overhaul sub-items (#202, #185, #191 — note #218 is itself an epic, "Domain Pages Overhaul (epic)", already exists; decide whether UI's Status references #218 directly rather than re-listing its three sub-issues).
9. **API Additions** — non-epic bucket. Populate from old tracker's Wave 4b (#200, #204, #213, #244, #266) plus the un-issued "orchestra-pit/rolodex as core utilities" item.
10. **Untracked** — keep as the user's catch-all; currently just #213 duplicated from API Additions, dedupe that.
11. **Memex-specific sub-group** — keep as-is; it's explicitly an open audit task, not a status section.

Note #218 "Domain Pages Overhaul (epic)" already exists and pre-dates this restructure — decide whether to give it its own top-level section (matching the "epic = section" rule) or fold it under UI as a reference, since it's UI-flavored. Either is defensible; use judgment, the user hasn't specified.

## Step 4 — Retire the old tracker

`docs/plans/point7/v07-tracker.md` (no space in filename) is being superseded. Before deleting or archiving it:

- Confirm every item in its Decisions log that's still load-bearing (the sequencing note "4a blocks Wave 5" → now "RDF-Star epic blocks Deletion epic", the "these four items are deliberately unticketed" note, the "◆ Memex-adjacent" table) has a new home — either in the relevant epic issue body (Step 1) or in the new human tracker (Step 3). Don't lose real information, but don't copy the evidentiary detail (commit hashes, verification dates) forward — that's exactly the bloat being cut.
- Once migrated, either delete the file or move it to something clearly marked historical (e.g. `docs/plans/point7/archive/v07-tracker-2026-08.md`) — user's call, ask if unclear, don't just pick silently since this is documentation history, not code.

## Step 5 — Design the tracker-maintenance skill

The user wants a skill so future sessions can refresh `v07-tracker-human.md` from GitHub state without re-inflating it back into the old style. Use `superpowers:writing-skills` to author it properly rather than freehanding the file.

Proposed shape (adjust as the writing-skills process dictates):

- **Location:** `.claude/skills/v07-tracker/SKILL.md` — a new top-level project skill, separate from `.claude/skills/octothorpes/` (that one is OP domain/API knowledge; this is a process/workflow skill about this specific tracking document).
- **Trigger:** session start for v0.7 planning work, or explicit invocation ("update the tracker", "sync the tracker").
- **Behavior:**
  1. Read `v07-tracker-human.md` and the current epic issues (by number, from the tracker's own `Issues` lists — don't rediscover them by searching GitHub each time).
  2. For each referenced issue, check open/closed state and title via `gh issue view`. Flag (don't silently fix) anything that's closed in GitHub but still shown as open work in the tracker, or vice versa.
  3. Update `Status` lines only when the underlying state has actually changed — don't rewrite prose that's still accurate.
  4. When a checkbox item completes, move detail (what changed, verification, numbers) to a comment on the relevant issue OR an entry in `release-notes-development.md` — whichever fits — never back into the tracker doc itself. This is the core discipline the skill exists to enforce.
  5. New epic-worthy scope gets a real epic issue filed (matching the `(epic)` suffix + Design/Scope/Related shape), not a bigger tracker entry.
  6. Non-epic buckets (Bug Fixes, UI, API Additions, Untracked) get new issues added to their `Issues` list as they're found, without needing an epic.
- **Explicit non-goals to state in the skill:** don't add wave labels (they're gone, stay gone), don't add commit hashes or verification dates to the tracker doc, don't let any section exceed roughly what fits on one screen — if it's growing, that's a sign the epic issue should absorb the detail instead.

Write the skill AFTER Steps 1-4 are done and the new tracker exists in its target shape — it's easier to write a skill that maintains a pattern once the pattern is real, rather than designing it in the abstract.

## Order of operations summary

1. File the 5 epic issues (Step 1)
2. Cross-link sub-issues back to their new epics (comment or body edit)
3. Delete wave/0-7 labels (Step 2)
4. Rewrite/rename the human tracker (Step 3)
5. Retire the old tracker (Step 4)
6. Write the maintenance skill (Step 5)

Steps 1-2 touch GitHub (shared state) — since this session already has a working relationship with the user on this exact task, proceed without re-confirming, but do surface a summary of what was filed/deleted before moving on to Step 3, in case something needs correcting before it's compounded into the tracker rewrite.
