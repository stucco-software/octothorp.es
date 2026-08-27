---
title: Publishers
description: Get any OP query back as RSS, a calendar, or a Bluesky post.
layout: octo_page.html
permalink: publishers/index.html
eleventyNavigation:
    key: Publishers
    order:
date: git Last Modified
tags:
---

> ## ⚠ UNREVIEWED CLAUDE DRAFT
> Written by Claude, not yet edited by a human. Delete this block before publishing.

Every query you can make against an OP relay can come back as something other than JSON. Add a format name to the end of the URL and the same results arrive as an RSS feed, a calendar file, or a Bluesky post -- <a rel="octo:octothorpes" href="https://octothorp.es/get/everything/thorped/rss?o=demo">here's every page thorped `demo`, as RSS</a>.

A **publisher** is the thing that does that conversion. It's the mirror image of a [harmonizer](/harmonizers/): a harmonizer reads a page and turns it into OP's internal shape, and a publisher takes that shape and turns it back out into whatever format you asked for.

## Getting a feed

Take any `/get/` URL and put the format name after `[by]`:

```
https://octothorp.es/get/everything/thorped/rss?o=demo
                     └─ what ──┘ └─ by ─┘ └as┘
```

That's it. The [API docs](/op-api/) cover everything you can put in `what`, `by`, and the query string -- all of it works with any publisher.

{% alertAlt 'warning' %}
**The format goes in the path, not the query string.** `?as=rss` does _not_ work -- you'll get plain JSON back and nothing telling you why. Same if you misspell the name: an unrecognized format falls through to normal JSON results rather than returning an error.
{% endalertAlt %}

## What you can ask for

| Name | You get | Content-Type |
|---|---|---|
| `rss` | RSS 2.0 feed. Also spelled `rss2`. | `application/rss+xml` |
| `ics` | An iCalendar file. Dated pages become calendar events. | `text/calendar` |
| `bluesky` | Ready-to-post `app.bsky.feed.post` records, with links and hashtags already faceted. | `application/json` |
| `standardSiteDocument` | `site.standard.document` records for ATProto. | `application/json` |

Try them:

- [`/rss`](https://octothorp.es/get/everything/thorped/rss?o=demo) -- point any feed reader at it
- [`/ics`](https://octothorp.es/get/everything/thorped/ics?o=demo) -- subscribe in a calendar app and dated OP pages show up as events
- [`/bluesky`](https://octothorp.es/get/everything/thorped/bluesky?o=demo) -- each result is a complete post record, ready to hand to the API

This works across every kind of query, not just page listings. [`/get/thorpes/thorped/rss?o=demo`](https://octothorp.es/get/thorpes/thorped/rss?o=demo) gives you a feed of _terms_ rather than pages, and [`/get/domains/posted/rss`](https://octothorp.es/get/domains/posted/rss) gives you one of every domain the relay knows about.

Relays can add their own formats on top of these, so what's available depends on which relay you ask. This one also runs `readable`, which fetches the text of every page in the results and hands it back inline -- useful if you're building something that needs the content and not just the link.

## Feed titles

Formats that wrap their items in a container -- RSS's `<channel>`, ICS's calendar name -- get a title, link, and description built from your query. Ask for everything thorped `demo` and the channel comes back titled "Get blobjects thorped to demo", with a `<link>` pointing at the URL you called. You don't have to do anything to get this, and it means a feed you've saved somewhere can always tell you what it was asking for.

## Making your own format

If you run your own relay, you can add formats of your own -- an events-only calendar, a JSON shape your app already speaks, anything you can write out as text. See [Building publishers](/publishers/building/).
