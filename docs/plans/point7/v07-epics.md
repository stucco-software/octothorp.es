# v0.7 Epics

Sections are epics. Detail lives in the issues, not here — verification steps, root causes, and before/after numbers go in issue comments or `release notes/release-notes-development.md`.

# OP Client Profile and Vocabulary

Epic: **215**

### Status

In-progress

### Issues

* [ ] 235 - rename index.js
* [ ] 269 - we should rename profile.json to op_client.json. it's too generic
* [ ] 216 - merged but needs work
	* [ ] profile on the main Relay is confused and incorrect. it has some memex related stuff in it.
* [ ] 217 Actually read from profile - REVIEW
	* [ ] write human-readable description of issue
	* [ ] compare requirements against what was shipped and merged
* [ ] 236 Declare link subtypes in Profile -- REVIEW
	* [ ] confirm that subtype paths still behave after the RDF-Star migration
* [ ] 195 - canonical vocabulary cleanup. context.json regeneration waits on 270.
* [ ] 166 - on-demand Document Records. Open surface is the stored `octo:harmonizeWith` ref.

### TODO:

* [ ] Write simple documentation
* [ ] Add example demos to demo site
* [ ] Re-test demos
* [ ] Add demos to smoketest

# RDF-Star Relationship Model Migration

Epic: **270**

### Status

Not started. Critical path — blocks Deletion.

### Issues

* [ ] 231 - derive backlinks instead of storing the reciprocal switch
* [ ] 268 - octo:created on relationships
	* [ ] don't break the `?s ?o ?date` read path or RSS link feeds go empty
* [ ] 192 - content labels, riding on this migration

Four more pieces are deliberately unticketed until the migration design settles (identifier-key rename, the statement-metadata rewrite itself, data migration, JSON-LD publisher endpoint). They're listed in 270's Scope. Don't file them early.

# Deletion

Epic: **271**

### Status

Not started, blocked on 270.

### Issues

* [ ] 248 - unified deletion module. Blocker for the other two.
	* [ ] decide: inbound refs on hard delete
	* [ ] decide: what soft-delete means on read
* [ ] 26 - delete statements when removed from a page
* [ ] 167 - archive/soft-delete 404 URLs

# Publishers

Epic: **272**

### Status

Deployed on staging. Lightly tested. Needs documentation and examples.

### Issues

* [ ] 226 - site-defined ICS publisher
	* [ ] core already ships a general `ics` publisher — decide whether that closes this
* [ ] 250 - publisher profile-compat check. Deferred.
* [ ] 161 - Publishers MVP. Probably closeable once docs land.

### TODO:

* [ ] Write basic documentation
* [ ] Add example demos to demo site
* [ ] Re-test demos
* [ ] Add demos to smoketest
* [ ] Append Publishers MVP release notes

# Handlers

Epic: **273**

### Status

Deployed on staging. Lightly tested. Needs documentation and examples. Code-complete otherwise.

### TODO:

* [ ] Write basic documentation
* [ ] Add example demos to demo site
* [ ] Re-test demos
* [ ] Add demos to smoketest

# Batch Indexing

Epic: **274**

### Status

Not started. Depends on Handlers (273) being done.

### Issues

* [ ] 180 - Batch Indexing MVP
* [ ] 43 - index statements via an Octothorpes blobject file. Closer than it looks; fold into 180.
* [ ] 177 - harmonize sitemap.xml. Depends on 180.
* [ ] 267 - optimize the update method on re-index. Same write path.

# Bug Fixes

Catch-all bucket, not an epic.

### Status

Deployed on staging. Lightly tested.

### Issues

* [ ] 253 - case matching on search pages too strict; stale tags after rename
* [ ] 241 - guard mention-path origin logic against non-http(s) schemes
* [ ] 243 - markdown handler follow-ups

### TODO:

* [ ] Write simple dev-focused documentation
* [ ] Add example demos to demo site
* [ ] Re-test demos
* [ ] Add demos to smoketest

# UI

Catch-all bucket. Includes the Domain Pages Overhaul epic (218) rather than giving it its own section.

### Status

Not started.

### Issues

* [ ] 218 - Domain Pages Overhaul (epic). Sequence: 202 refactor → 185 posted view → 191 numerical alias.
* [ ] 158 - default to fuzzy results on hashtag list
* [ ] 199 - "links with this hashtag" view
* [ ] 254 - stop committing built web components

### TODO:

* [ ] Implement a lewk.css based layout system
* [ ] Add UI for /discover
* [ ] Route legacy RSS endpoints through the modern system

# API Additions

Catch-all bucket. Independent of everything else.

### Status

Not started.

### Issues

* [ ] 200 - ?st= param to query by arbitrary relationship subtype
* [ ] 204 - typed errors from core indexer with HTTP status codes
* [ ] 244 - replace getStatements guard with query-validity + pagination policy
* [ ] 266 - /get/domains/posted ignores s=
* [ ] 213 - wire endorsement gating in handleMention. Design-heavy, deferred.

### TODO:

* [ ] Make orchestra-pit and rolodex core utilities — unspecced, needs an issue or a demotion

# Untracked

Things in the milestone that don't have a home yet.

* [ ] 168 - use badge.png to trigger a registration request
* [ ] 160 - more levers for query param handling
* [ ] 145 - indexing via webmention. Now "add a handler mode"; the markdown handler is the template.
* [ ] 196 - basic graph relationship primitives. Recommend moving to v0.8.
* [ ] 221 - replace removed verifyContent origin checks with index-policy mechanisms
* [ ] 222 - allow a domain with a subpath to act as a domain
* [ ] 228 - internal SvelteKit urls should use instance
* [ ] 224 - update Bear Blog's check to the New Way

### Memex-specific sub-group

Some work was done specifically to address the needs of the Memex project. We should carefully document what that was and confirm it doesn't conflict with upcoming work.
