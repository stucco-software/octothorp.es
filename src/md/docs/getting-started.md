---
title: Getting Started
description: Overview of Octothorpe Protocol and how to use it
layout: octo_page.html
permalink: getting-started/index.html
eleventyNavigation:
    key: Getting Started
    order: 2
date: git Last Modified
tags:

---


## OP in a nutshell

Octothorpe Protocol is a lightweight system for creating hashtags and other link relationships between different websites. Any site using OP can send and receive information about hashtags, links, backlinks, bookmarks, webring membership and more with any other site using OP as if they were on a shared platform. The process is simple and platform-independent.

**Register with an OP server**

First, a site must register its domain with the OP server(s) it wants to use. Then, by adding a single line of HTML to the head element of any page it wants to octothorpe, it can request the OP server to index that page. (OP servers do not crawl sites; they only index pages that actively request it.) When the page is loaded, it pings the OP server, which then scans the page for markup that identify octothorpes and other link relationships.

**Identify octothorpes in HTML**

The default way to octothorpe a link is to add `octo:octothorpes` to the `rel` attribute of either an `a` or a `link` element. However, OP allows you to define your own set of identifiers with a spec called a harmonizer, so OP can be used with your own custom markup or without changing your markup at all.

**Links become octothorpes**

"Octothorping" a webpage creates a relationship between the page's URL and the octothorped term on a server. All pages sharing terms and servers will be linked to each other just like posts with the same hashtags are linked on closed platforms. Other types of link relationships can be tracked as well, such as backlinks, bookmarks, mentions, and webring membership.

**OP Servers and simple and distributed**

Servers are simple API hosts, and the network is inherently distributed. A site can interact with an unlimited number of OP servers at once, and servers can federate their data using the native remote endpoint feature of their SPARQL database. Besides octothorpes, OP servers only store basic page data such as the `title`, `description`, and social preview image. The canonical state of the data is the distributed network of websites -- an OP server only represents that relationship graph in an easy-to-query way. The OP API provides JSON and RSS feeds of any valid query, giving end users the tools to filter and moderate their own feeds with a high degree of control. Communication between servers and pages happens over standard HTTP requests, and sites can use OP with static HTML. Relationships are stored as RDF, with an extensible vocabulary of relationships. The core protocol tracks hashtags, links, backlinks, bookmarks, and webring membership. Additionally, it includes some basic client-side tools for easy adoption, such as web components, debug endpoints, and integrations with popular systems.

## Data lifecycle

Data travels from websites into the OP network like this:

1. somewebsite.com registers with an OP Server by filling out a form on the server
2. If necessary, a server admin approves the website
3. somewebsite.com now appears in the list of domains at `/domains` on the OP server
4. somewebsite.com can ask the OP server to index its pages by placing a special `<link>` tag in the head of any page it wants it to look at.
5. When the page is loaded, this link will tell the OP server to scan the page.
6. The page sends data to the server by including special markup that the server recognizes on it.
7. The server records that data as statements in the data store, as well as metadata about the page, if present (such as title, description, or preview image)
8. This data then shows up on the server's UI or in queries sent to the API.

### Not convinced?

[Read our beautiful pitch](/pitchpage.md)

### Ready to go?

If you don't need more details, check out the [quickstart](/quickstart.md)

### Next Steps

- [Register With a Server](/register-with-a-server.md)
- [Learn about Statements](/make-statements-on-your-page.md)
- [Make your first Octothorpes](/write-statements.md)
- [Learn about the API](/op-api.md)
- [Learn about Harmonizers](/harmonizers.md)
