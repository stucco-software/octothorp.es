---
title: Make Statements on Your Pages
description: How OP reads your page to record data you send to the server.
layout: octo_page.html
permalink: make-statements/index.html
eleventyNavigation:
    key: Make Statements
    parent: Getting Started
    order: 2
date: git Last Modified
tags:

---




## Servers look for statements about relationships

When a server indexes your page, it looks for relationships to hashtags or other pages made with **statements** recognizable by OP.

> OP only looks at the HTML that comes directly from your server. This means that any octothorpes added with client-side JavaScript will not be verified. The relationships must be present in the HTML that comes from your server to be trusted.

**The server saves the relationships to its graph.**

The graph is a series of statements about domains, pages, and their relationships.

Statements a page makes about a term are what we call hashtags, tags, or octothorpes. In OP these are called `terms`

Statements a page makes about another page are `links`.

Statements about a pages that mutually octothorpe each other are `backlinks`.

Links can be declared as bookmarks or other subtypes, yet to be defined.

> When we just say something is an "octothorpe", that usually means a hashtag that uses OP to connect across sites. In OP, these are called `terms` to distinguish them from other kinds of **octothorped links.**


## Statements you can make about your page with OP

OP tracks relationships between webpages with `statements`

If you put the hashtag `#hummingbirds` on your page, the equivalent statement is

`yourpage.com/hummingbirds octothorpes hummingbirds`

In the datastore of the OP server, that looks like:

`<https://yourpage.com/hummingbirds> octo:octothorpes <https://CURRENT-OP-SERVER.COM/~/hummingbirds>`

where `CURRENT-OP-SERVER.COM` is the server that you're sending data too.


Every OP server has an endpoint for `terms` that follows this structure:

`server-domain.com/~/term`


which are what we call "hashtags" or just plain "octothorpes".


### Octothorpes

You can "tag" or "hashtag" or just "octothorpe" a page by telling OP that you have linked to a server's endpoint for a term.
### Links

You can also octothorpe a regular link to another page. That just means recording that link relationship on an OP server. OP servers then let you query or subscribe to link relationships they record just like hashtags.


So if Site A, B, and C all octothorpe their links to Site D, you can get a list of all sites linking to Site D.

### The difference between Links and Hashtags

> Octothorpe relationships to `Terms` are treated as hashtags and referred to simply as "octothorpes"
>
> Octothorpe relationships to `Pages` are `Links`, which have subtypes such as `Bookmarks`


### Special types of links

`links` can have types.

### Processed link types

`backlinks` are links that have been endorsed or mutually linked by the page linked to. A `link` cannot be unilaterally declared as a `backlink`; the target of the link must either `endorse` the domain the link is coming from or `link` back to the same page. When the system determines that to be the case, a `backlink` record is added.

### Labeled subtypes

You can also assign subtypes to a `link` to categorize them. Subtypes other than `backlinks` don't have intrinsic meaning, but the following types currently have their own endpoints:

`bookmarks`


> v1 will allow you to add terms to links, like hashtagging a bookmark, but that's not available yet in v0.5


### How to actually record these links

Ok, so how does this actually work? What do you put on your page to use OP?

Next: [Add markup the server can recognize.](/write-statements.md)
