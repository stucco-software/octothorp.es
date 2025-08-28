---
title: Quickstart
description: High speed, low-detail guide
layout: octo_page.html
permalink: quickstart/index.html
eleventyNavigation:
    key: Quickstart
date: git Last Modified
tags:

---
# No Website? No Problem

[Bear Blog](https://bearblog.dev/) and [Peep.zone](https://peep.zone/) currently implement OP. Peep is free, and thorpes on the main server.

[Bear Blog has its own server](https://bearblog.octothorp.es/) that doesn't require registration, but you will need a paid accoiunt. [Follow these instructions](https://octothorpes.bearblog.dev/you-can-use-hashtags-on-your-bear-blog-now/) to get set up on Bear.

# Got a Website?

Great. We love websites. Follow these steps:

## First, register your domain

Right now only registered domains can post to the main site. [Register here](https://octothorp.es/register) and you'll receive an email when your registration is complete.

## Options


### 1. Add them in your site's code

If you're comfortable editing HTML and have your own site you can start octothorping by adding just a small amount of HTML to your page. There's also a web component you can use. Instructions below.

### 2. Use Wordpress

We have a Wordpress plugin that should work out of the box to turn tags into Octothorpes.

Install [this plugin](https://docs.octothorp.es/assets/octothorpes-for-wordpress.zip) and add `https://octothorp.es/` as the server [like so](https://octothorped-wordpress.pikapod.net/.com/how-it-works/).

### 3. Use our pre-configured Glitch site

~~If you don't have your own site or want to start fresh, [remix our starter site on Glitch](https://octothorpenty.glitch.me/) You will need a Glitch.com account to do this, but it's easy to set up.~~

> Glitch is dead but we still have the pre-configured 11ty site that this was running on. We'll update it and post it back here eventually.

## How to add to your page's code

Note: to do this you will need to have a website that lets you edit the `<head>` element

### Basic method

**Step 1:** Add this to the `<head>`:

```
<link rel="preload" as="fetch" href="https://octothorp.es/?uri=YOURDOMAIN.COM/PATH/TO/CURRENT/PAGE">
```

This tells the Octothorpe Ring to index your page when you load it and checks the provided URI against the actual URL making the request.

Replace `YOURDOMAIN.COM/PATH/TO/CURRENT/PAGE` with your actual domain and page path however you want.

Then, for each hashtag (octothorpe) you want to apply to the page add this to the `<head>` element

```
<link
  rel="octo:octothorpes"
  href="YOUR-TAG" >
```

where `YOUR-TAG` is the octothorpe you want to tag the page with.

### Fancy web-component method

Do Step 1 from the standard method and then add this to your page:

```
<script
async=""
defer=""
type="module"
data-register="https://octothorp.es/"
src="https://octothorp.es/tag.js"></script>
<link rel='stylesheet' href='https://octothorp.es/tag.css'>

```


Once you've done this, you can use the `<octo-thorpe>` web-component anywhere to octothorpe your page.

`<octo-thorpe>demo<octo-thorpe>` will turn into <octo-thorpe>demo<octo-thorpe>

### Show off your flair

Once you're on the ring, you might enjoy our classic webring button:

<a href="https://octothorp.es"><img src="https://octothorp.es/badge.png" alt="Badge for the Octothorpes main ring" /></a>

Just paste the following code on your site wherever you want:

`<a href="https://octothorp.es"><img src="https://octothorp.es/badge.png" alt="Badge for the Octothorpes main ring" /></a>`



### Need more details?

Check out [Getting Started](/getting-started.md)
