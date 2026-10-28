---
## Handles vs. aliases
---

I'd stop calling the relay number an alias and call it a **handle** instead, because it works very differently from `octo:Alias` even though the two will connect.

> **Context:** `siteNum` (the permanent number a relay gives each verified origin, reachable at `/domains/<n>`) already acts like a short name for a site on that relay. An `@user` shorthand would make that number, or a chosen name, the thing people type.

### Why they're different

| Property | `octo:Alias` | Handle (`siteNum` / `@name`) |
|---|---|---|
| Who sets it | The page author, in markup | The relay |
| Where it's valid | Everywhere | Only on that one relay |
| What it links | Two resources that are the same thing | A short name to one account |
| Uniqueness | Not required | Required within the relay |
| Can it change | Whenever the content changes | Number never changes; a chosen name could |

If both were called "alias", they'd get the same treatment, so a relay-assigned name would look like an author's claim and vice versa.

### How they fit together

- **Handle:** `@42` or `@nim` resolves to the account anchor (the verified origin) on that relay.
- **Aliases:** Hang off that anchor and list the person's other surfaces.
- **Across relays:** `@nim@octothorp.es` would follow the Fediverse pattern of name plus server, which matters for the OP World relay-of-relays design.

### Name handles need rules the numbers don't

1. **Claiming:** Decide who can pick a name, probably only a verified origin and only through an admin- or profile-gated step.
2. **Squatting and blocks:** Reuse `policies.access.blocks` patterns for reserved or banned names.
3. **Renames:** Keep the number as the permanent ID and let the name be a changeable label on it, so old `@name` links can redirect or fail clearly.
4. **Normalization:** Apply the term-identity lessons from #329 (the percent-encoding vs. typed-string question) from the start, so `@Nim` and `@nim` don't become two accounts.

> **Note:** Renaming the concept is cheap right now, since only the release notes and `/domains` page copy say "numeric domain alias", and the stored predicate is `octo:siteNum`, which needs no change.

- **Next Action:** Say "go" and I'll file an issue proposing "handle" as the term, with the numeric-ID-plus-optional-name model and the four rules above.