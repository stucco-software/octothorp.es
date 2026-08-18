---
name: v07-tracker
description: Use when updating, syncing, or refreshing v0.7 status in docs/plans/point7/v07-epics.md, or when a v0.7 issue closes and the tracker needs to reflect it
---

# Maintaining the v0.7 epics tracker

`docs/plans/point7/v07-epics.md` is a dashboard, not an archive. Its predecessor grew commit hashes, verification dates, and design rationale until it stopped being scannable — that is the failure this skill exists to prevent.

**The tracker answers "what's the state of things?" It never answers "why?" or "how do we know?"**

## The two files

| File | Status |
|---|---|
| `docs/plans/point7/v07-epics.md` | **Live.** The only tracker you edit. |
| `docs/plans/point7/v07-tracker.md` | **Historical. Never edit it.** Superseded 2026-08-17, kept for reference only. |

Do not update `v07-tracker.md` "for consistency." Do not patch one line of it. Do not port a checkbox into it. It is frozen. If its contents contradict the live tracker, the live tracker wins and the old file stays wrong.

## Where completion detail goes

When you tick a checkbox, the detail goes somewhere else. Pick by audience:

- **Issue comment** — root cause, what was rejected and why, before/after numbers, verification command and result. This is the default and the most findable.
- **`docs/plans/point7/release notes/release-notes-development.md`** — issue number, one-line description, files affected. Per project convention.
- **A code comment at the changed line** — the invariant only, plus the issue number. Best defense against someone refactoring the fix away.

No fixed rule between the first two. Use both when both fit.

### Which model writes it

Draft issue comments, release notes, and development notes with **Opus at low effort**, or **Sonnet at low-to-medium effort**. High-effort reasoning produces padded, over-hedged prose for what should be a few tight paragraphs — the point is a findable record, not an essay.

If you're delegating the writing, set it explicitly: `Agent(..., model: "opus", effort: "low")`. If you're writing it yourself in a high-effort session, cut hard before posting — no restating the issue title back, no summarizing what you just did in the paragraph above, no "Summary"/"Conclusion" headers on a three-paragraph note.

## Syncing against GitHub

1. Take issue numbers from the tracker's own `Issues` lists. Don't rediscover them by searching GitHub.
2. One batched call: `gh issue list --milestone "v 0.7" --state all --json number,state,title`.
3. **Report drift, don't silently fix it.** Closed in GitHub but unchecked here, or vice versa — surface it and let the human decide. A closed issue is not always finished work.
4. Never tick a box for work you haven't verified exists. Absent commit, absent test file, absent branch → say so and stop.

## Writing rules

**Issue lines.** `* [ ] 266 - short human gloss`. Bare number, no `#`. Sub-bullets only for a genuinely open question or a decision someone must make.

**Ticking.** Change `[ ]` to `[x]` and leave the line in place — the issue number stays a searchable anchor. Remove ticked lines only when the whole epic closes out and the section is deleted.

**Never add to a line:** commit hashes, dates, file paths, test names, before/after numbers, root cause, links to plan docs. If the gloss no longer fits on one line, the detail belongs in the issue.

**Status lines.** Rewrite only when the section's overall state changed — not when a single issue inside it moved. One bugfix landing in a five-issue bucket does not flip `Not started` to `In-progress`; the checkbox already says that. Flip it when the first substantive work starts, when it becomes blocked, or when everything in it is done.

## New scope

- **Epic-worthy:** propose a new `(epic)` issue and wait for approval. Don't file it yourself — issues are shared state. Match the existing shape: `Title (epic)`, body with a summary, `## Scope`, `## Related`, milestone `v 0.7`, topical labels only.
- **Not epic-worthy:** add a line to a catch-all bucket (Bug Fixes, UI, API Additions, Untracked). No epic needed.
- **The epic's body is the source of truth** for which issues belong to it. Each epic also has an `epic/<name>` label for querying (`gh issue list --label epic/deletion`) — add it to new sub-issues, but if the label and the body disagree, the body wins. Don't let the label become a second list to maintain.

## Red flags — stop

- About to edit `v07-tracker.md` → don't, it's frozen
- Writing a commit hash or a date into the tracker → it goes in the issue
- A section grew past one screen → its epic issue should absorb the detail
- Adding a `wave/N` label → those were deleted 2026-08-17, deliberately
- Ticking a box you haven't verified → verify or leave it
- Drafting an issue comment at high effort → drop to low, or cut hard before posting

## Rationalizations

| Excuse | Reality |
|---|---|
| "The old tracker should stay consistent" | It's frozen. Inconsistency is expected and fine. |
| "This detail is too important to bury in an issue" | Issues are more findable than a planning doc. Bury it there. |
| "Just one line of context on the checkbox" | That's how the last tracker died. One line becomes sixty. |
| "The issue is closed so it's done" | Closed ≠ verified. Check, or report the drift. |
| "A new section is easier than filing an epic" | Growing sections is the bloat. File the epic. |
