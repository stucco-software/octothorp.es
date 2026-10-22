Found 2026-10-22 while reviewing #326 (closed as already-implemented).

`termBlocked` in `packages/core/access.js` normalizes a term by lowercasing, trimming and stripping surrounding slashes, but it never percent-decodes. An author can therefore mint a blocked term by encoding it:

```
termBlocked(t, ['slur', 'slur two'])

"slur"        -> true
"SLUR"        -> true
"/slur/"      -> true
" slur "      -> true
"sl%75r"      -> false   <- evades
"slur%20two"  -> false   <- evades, while "slur two" -> true
```

Why this is a real hole rather than a curiosity: #306 established that a percent-encoded term and its decoded spelling are the SAME term on the read path (`site changes` finds `~/site%20changes`). So the encoded form resolves to the blocked term's page for every reader, while the write-time gate that was supposed to refuse it never fired.

Fix: decode once before normalizing, sharing whatever guard #306's read-path matching uses so the two paths agree by construction. Malformed sequences must not throw — `decodeURIComponent('%zz')` raises, and a bad escape should fall through to the raw string rather than taking down the index call.

Worth covering in tests: double-encoding (`%2575`), mixed case escapes (`%7A` vs `%7a`), a `+` for space, and a blocklist ENTRY that is itself written encoded.

Related: #306 (percent-encoded term matching on read), #326 (the blocklist itself, already implemented), #271 (deletion — out of scope here, this is prospective only).
