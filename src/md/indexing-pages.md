# Indexing a Page

Pages are passively indexed by Octothorpe Rings. To index a page whenever someone visit it, add this `link` tag to the documents `head`.

```
<link 
  rel="preload" 
  as="fetch" 
  href="<ring>/?uri=<page>">
```

`<ring>`: The URL for an Octothorpes Ring.

`<page>`: The URL for the page being indexed.

A single page can request indexing from any number of Rings. Include one `<link>` tag for each Ring.

By default, a ring will not index a page more regularly than once every five (5) minutes.

## Next:
[Create Octothorpes with Link Tags](/docs/link-tag)