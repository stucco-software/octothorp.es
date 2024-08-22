---
type: Documentation
prefLabel: How Indexing Works
---

When you use the `<link>` to request that a page gets [indexed](#indexing-pages), here's what happens:

### 1. Your page sends a GET request to the server.

The `?uri=` query paramenter gets sent along with this request to tell the server which page it should index. The server only can see the originating domain, and this `uri` parameter.

Any page on your domain can request any other page get indexed by sending this `GET` request. Adding the `<link>` element anywhere in your document does this on page load, but it can happen at any time in any way.

### 2. The server checks to see if this domain is verified.

If the domain requested for indexing is a verified member of the ring, it will get indexed. Otherwise it wont.

### 3. The `uri` gets indexed.

The server will request the HTML body of `uri` in order to index it. It will not make more than 1 request every five minutes to avoid DDoSing you.

This request is just a regular `fetch` request to `GET` your page. It should not impact your server any more than a single user visiting your site would.

### 4. Look for relationships.

In the HTML that comes directly from the server, we look for any [tags](#tags), [links](#backlinks), or [bookmarks](#bookmarks).

This means that any Octothorpes added with client-side JavaScript will not be verified. The relationships must be present in the HTML from your server to be trusted.

### 5. The server saves the relationships to it's graph.

The graph is a series of statements about domains, pages, and their relationships.

Statements about a page that octothorpes a term are [hashtags](#tags).

Statements about a page that octothorpes another page are [backlinks](#backlinks).

Statements about a page that octothorpes another page with terms are [bookmarks](#bookmarks).