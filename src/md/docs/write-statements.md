---
title: How to Write Statements
description: Technical guide to adding OP compatible statements to your page.
layout: octo_page.html
permalink: how-to-write-statements/index.html
eleventyNavigation:
    key: How to Write Statements
    parent: Getting Started
    order: 2
date: git Last Modified
tags:

---




## Add recognizable markup to your page

OP Servers use [[Harmonizers]] to know what to look for on your page. If you don't want to change the markup of your page, you can use a custom harmonizer by writing your own. If that is of interest to you, refer to the [[Harmonizers]] documentation.

> v1 will include a set of harmonizers for common site structures, such as wordpress, WebMentions, Tumblr, and more. Experimental versions of some of these already exist

### You don't have to understand harmonizers to use Octothorpes

OP has a default method of looking for relationships on your page that requires minimal additional HTML. The following shows how to use that method.

## Default Markup for using Octothorpes
### Octothorpes ie hashtags


### Option 1: Add a `<link>` tag in the head of your page

You can octothorpe a page by adding a `<link>` tag to your pages `<head>`. This method lets you use octothorpes without them showing up in the rendered page.

```
<link
  rel="octo:octothorpes"
  href="hummingbirds" >
```

`rel=`: Defines the `link` as an Octothorpe.

`href=`: References a Tag on an OP server.

This `<link>` will tag the page with the octothorpe `#hummingbirds`.

>Note: This  is the only default method that will accept a non-url value as the "href." This is a shorthand method that will get turned into a valid link to the URL for that term on the server.

### Option 2: Anchor link on page

If you want a link to be an octothorpe in the content of your page rather than just metadata, you can use an `<a>` tag.

```
<a
  rel="octo:octothorpes"
  href="https://OP-SERVER/~/hummingbirds">
  Use any link text you choose
</a>
```

`OP-SERVER`: the server you are posting to

`rel=`: Defines the `link` as an Octothorpe.

`href=`: References a Tag on an Octothorpes Ring as well as a URL on your website.

This `<a>` will tag the page with the octothorpe <a
  rel="octo:octothorpes"
  href="https://octothorp.es/~/hummingbirds">
 hummingbirds
</a>

### Option 3: Web Component on page

The Octothorpes Web Component is a Custom Element that sends your page's tag to an OP Server, and displays all other pages that are connected that tag.

## Include the Component Script

Add the Web Component script to your page, making sure to add the `data-register` attribute to connect to any Community Server's your domain is verified with.

```
<script
  async="" defer="" type="module"
  data-register="OP-SERVER"
  src="OP-SERVER/tag.js"></script>;
```

`OP-SERVER`: the server you are posting to

Once you've loaded the component, you can use it by adding  `<octo-thorpe>termYouWantToUse</octo-thorpe>` to your page and it will look like this:

<octo-thorpe>hummingbirds</octo-thorpe>

### Links


It's as simple as adding `rel=octo:octothorpes` to any link that is **not** a link to an term url on an OP.

So you can use methods #1 or #2 above, with any well-formed url.

> Link: `literally-any.website`
>
> Octothorpe: `https://octothorp.es/~/term



### Backlinks

Your link will be turned into a backlink in the following circumstances:

- the domain or page you `link` to explicitly `endorses` your domain or page
- the exact URL that you `link` to also has a `link` to the exact url you have linked to
### Bookmarks

To label a link as a bookmark you can use the subtype in the `rel` such as `rel="octo:bookmarks"`

### Endorsement

You can endorse a domain or page by adding the following to the `<head>` of your web page:

`<link rel="octo:endorses" href=URL-TO-ENDORSE>`

Domains or pages that you endorse will be able to backlink to you. If your page is a webring host, an endorsement will allow domains to join your webring.

> v1 will extend `endorses` with a web-of-trust method of registering sites

### Webrings

OP makes it easy to host and manage your own webring.

Any url can be a webring. To tell an OP server to treat your url as a webring add:

`<meta property="octo:type" content="Webring>` to the head of your document.

Then, on that page, octothorpe some links to the domains that you want to add to your ring. If they octothorpe a link back to you, their domain will be added as members to your ring.

### Self-moderated

You can manage your ring simply by adding or removing links on your ring's homepage. Members can remove themselves by removing their link to your webring's homepage.

> **Note:** OP only indexes the same URL every 5 minutes. Webrings are pretty new to OP, and so far it seems to take a little while for the full set of links and backlinks to kick in to create actual membership. Some patience may be required!

Here's an example webring: [https://demo.ideastore.dev/demo-webring](https://demo.ideastore.dev/demo-webring)

Once you have a webring, you can do fun things with the API like get a[ll the pages posted by all the members of the ring as RSS](https://octothorp.es/get/everything/members/rss?s=https://demo.ideastore.dev/demo-webring).


Next steps:
- [Learn about the API](/op-api.md)
- [Learn about Harmonizers](/harmonizers.md)
