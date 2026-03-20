What you'd need:**

1. **Store the mapping** -- When a record is created, you get back an `at://` URI. You need to persist the relationship between the OP page URL and the Bluesky post URI. This could live in the triplestore (e.g. `<page> octo:blueskyPost <at://did/app.bsky.feed.post/rkey>`) or in Bridge-side storage.

2. **Fetch interactions** -- Bluesky exposes `app.bsky.feed.getPostThread` and `app.bsky.feed.getLikes` on the public AppView API (`public.api.bsky.app`). No auth needed for public posts. Given the post URI, you can pull likes, reposts, replies, and quote posts.

3. **Surface via API** -- Either a new OP endpoint (e.g. `/get/interactions?uri=<page-url>`) that looks up the stored Bluesky URI and fetches interactions, or a simpler approach: the web component calls the Bluesky API directly with the `at://` URI.

4. **Web component** -- Something like `<octo-interactions>` that takes a page URL (or auto-detects `window.location`), resolves it to the Bluesky post, and renders likes/replies/reposts. Could follow the existing `octo-backlinks` pattern with `createOctoQuery`.

**Key architectural question:**

Should OP mediate (page URL -> OP API -> Bluesky API -> component), or should the component go direct to Bluesky (page URL -> OP API for the `at://` mapping -> Bluesky public API for interactions)? The direct approach is simpler and keeps OP out of the caching/rate-limit business for Bluesky data. OP just needs to answer "what's the Bluesky post for this page?"

**Triplestore vs Bridge storage:**

The `at://` URI mapping feels like network state (this page *is* that post), which fits the triplestore philosophy. The interaction counts themselves are ephemeral and should be fetched live.
