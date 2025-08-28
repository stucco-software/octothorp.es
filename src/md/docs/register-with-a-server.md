---
title: Register with an OP Server
description: To use OP on your site you have to be registered with an OP server.
layout: octo_page.html
permalink: join-server/index.html
eleventyNavigation:
    key: Join a Server
    parent: Getting Started
    order: 1
date: git Last Modified
tags:

---



## Register a Domain


Every Octothorpe Protocol server is a collection of verified domains, each opting in to being indexed and contributing its links to the overall network.

The first step is to add your domain to the server by registering.

> Note: Different servers may have different rules for domain verification, but they should have a [registration page](https://octothorp.es/register) to guide you.

To verify a domain in this server, the administrator of the server will determine if the domain is appropriate and aligned with the goals and [terms](/terms) of the server.


Once your domain has been [registered](/docs/register-a-domain), you should be able to send data to the network from your web pages. Check to see if your domain is present on the server's list of sites at `/domains`.

Next you need to set up your pages to **request indexing**

## Request indexing

Pages are passively indexed by Octothorpe servers. To ask a server to index a page whenever someone visits it, add this `link` tag to the document's `head` element.

```html
<link rel="preload" as="fetch" href="OP-SERVER/?uri=PAGE">
```


`OP-SERVER`: The URL for an Octothorpes server such as [https://octothorp.es](https://octothorp.es).

`PAGE`: The URL for the page being indexed.

This sends a GET request to the OP server's `index` endpoint.

> A single page can request indexing from any number of servers. Include one `<link>` tag for each server.


When you request indexing with that `<link>` tag, here's what happens:

**Your page sends a GET request to the server.**

The `?uri=` query paramenter gets sent along with this request to tell the server which page it should index. The server can only see the originating domain, this `uri` parameter, and an optional `as` parameter to define a [[Introducing Harmonizers | harmonizer]]

You can only ask for pages on your own domain to be indexed, but any page on your domain can request any other page on your domain be indexed by sending this `GET` request. Adding the `<link>` element anywhere in your document does this on page load, but it can be done manually if you so choose.

**The server checks to see if this domain is verified.**

If the domain requested for indexing is a verified member of the ring, it will get indexed. Otherwise it wont.

**The `uri` gets indexed.**

  The server will request the HTML body of `uri` in order to index it. It will not make more than 1 request every five minutes to avoid DDoSing you.

This request is just a regular `fetch` request to `GET` your page. It should not impact your server any more than a single user visiting your site would.

Next: [Learn about statements](/make-statements-on-your-page.md)
