---
type: Documentation
prefLabel: Bookmarks as Assertions
draft: true
---

Creating a Bookmark is adding Hashtags to a URL that you don't control. You create a bookmark by sending a URL that is _not_ on your domain to the an Octothropes Ring for indexing, along with additional information you want to associate with the bookmark.

```
<link
  rel="preload"
  as="fetch"
  href="<ring>
    ?uri=<not-your-url>
    &octothorpes=<term>"
>
```