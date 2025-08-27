---
title: Introducing Harmonizers
description: Harmonizers let you use your own HTML to octothorpe
layout: octo_page.html
permalink: harmonizers/index.html
eleventyNavigation:
  key: Harmonizers
  order: 4
date: git Last Modified
tags:
---


From the start we wanted Octothorpes to be as easy to use as possible. The original way to put them on your site only takes two lines of simple HTML. But even that can be a challenge with some website builders or hosting platforms. So we built harmonizers so you can use Octothorpe Protocol (OP) without changing the markup on your site.

An OP Harmonizer is a small text file that tells an OP server what to look for on your webpage. If you already have tags on your blog, for example, you can use a harmonizer to say "use my tags as octothorpes." Then, when the server looks at your page, it will interpret your tag as an octothorpe, magically turning your tags into a hashtag, connected to other sites using the same tag. All without you having to change the HTML on your page.

> Right now, you still have to include one line of HTML in the head of your webpage to ask an OP server to look at your page. OP Servers never look at pages unless you ask them to. We're working on products that will let you use OP in other ways, but for now you still need to be able to edit the head of your page.

### The technical part

At the moment, you will still need a little bit of knowledge of HTML to make your own harmonizer. If you're comfortable with that, read on.

Here's how a harmonizer works:

Harmonizers are just JSON files that define what selectors to use to look for Octothorpe statements on your page.

The default harmonizer looks for `link` elements with a `rel` attribute of `octo:octothorpe`

So if you put `<link href='harmonizers-are-cool' rel='octo:octothorpe'>` will get picked up and turned into a hashtag.

> Since "tag" and "hashtag" and "octothorpe" can get a little confusing, we will use the technical term for them in OP, which is `Term`. A term is defined in the database as "octo:Term", and is defined by a public urls on an OP server that follows this pattern: `server-name/~/term`. An octothorpe to a url like that is an octothrpe to a `term`, whereas an octothorpe to any other kind of url is an octothorpe to a `page`. Octothorping a term is what we call a "hashtag" or a "tag" or just an "octothorpe" for short. Octothorping a `page` is a `link`, which can have many subtypes, such as `bookmark` or `backlink`.


The rule in the harmonizer looks like this:

```json
{
    "selector": "link[rel='octo:octothorpes']",
    "attribute": "href"
  }
```

That's easy enough, but thanks to harmonizers we don't have to change anything on the page to use octothorpes.

Let's say your site already has tags, and they show up as keywords in the `head` of your pages.

So your page tagged `harmonizers-are-cool` has `<meta name="keywords" content="harmonizers-are-cool">` in the head. That's easy for harmonizers to find. So easy in fact we already have a harmonizer for it. Here's how to use it:

`<link rel="preload" as="fetch" href="OP-SERVER/?uri=PAGE&as=keywords">`

That will index your page using the harmonizer named `keywords`. Any rules present there will override the same rules in the default harmonizer. The rule it has for octothorpes looks like this:

```json
{
          "selector": "meta[name='keywords']",
          "attribute": "content",
          "postProcess": {
            "method": "split",
            "params": `,`
          }
```

but wait, what if you have multiple keywords? `<meta name="keywords" content="harmonizers-are-cool, cats, other-stuff">`

No problem. Harmonizer spec lets you define some basic filtering and post-processing of the matched content. That's the `postProcess` part of the rule.

To see how all these harmonizers work, let's head over to the orchestra pit. That's what we call the testing / debugging endpoint we built for harmonizers.

If you send your url to the orchestra pit, it will return both the data it's picked up form your url, and the ruleset for the harmonizer used.

Here's what this page looks like using the default harmonizer. If we hit [https://octothorp.es/debug/orchestra-pit?uri=https://demo.ideastore.dev](https://octothorp.es/debug/orchestra-pit?uri=https://demo.ideastore.dev)

```json
{
  "@id": "https://demo.ideastore.dev",
  "title": "Home - Octothorpes Demo",
  "description": "Welcome to the demonstration site for the Octothorpes protocol. Here you can see standard octothorpes and [backlinks](/backlinked-page) in action, plus some suggestions for [shorthand](/shorthand) methods of making them.",
  "image": "https://demo.ideastore.dev/assets/octomark.png",
  "contact": "",
  "type": "",
  "octothorpes": [
    "octothorpes",
    "demo",
    {
      "type": "link",
      "uri": "https://ideastore.dev/blog/why-tho"
    },
    {
      "type": "link",
      "uri": "https://demo.ideastore.dev/backlinked-page"
    },
    {
      "type": "link",
      "uri": "https://demo.ideastore.dev/tags-and-octothorpes"
    },
    {
      "type": "link",
      "uri": "https://demo.ideastore.dev/shorthand"
    },
    {
      "type": "link",
      "uri": "https://demo.ideastore.dev/synonyms"
    },
    {
      "type": "endorse",
      "uri": "https://octothorpenty.glitch.me"
    }
  ],
  "harmonizerUsed": {
    "@context": "https://octothorp.es/context.json",
    "@id": "https://octothorp.es/harmonizer/default",
    "@type": "harmonizer",
    "title": "Default Octothorpe Harmonizer",
    "mode": "html",
    "schema": {
      "subject": {
        "s": "source",
        "title": [
          {
            "selector": "title",
            "attribute": "textContent"
          }
        ],
        "description": [
          {
            "selector": "meta[name='description']",
            "attribute": "content"
          }
        ],
        "image": [
          {
            "selector": "meta[property='og:image']",
            "attribute": "content"
          },
          {
            "selector": "link[rel='octo:image']",
            "attribute": "href"
          },
          {
            "selector": "[data-octo-image]",
            "attribute": "href"
          },
          {
            "selector": "[data-octo-image]",
            "attribute": "src"
          }
        ],
        "contact": [
          {
            "selector": "meta[property='octo:contact']",
            "attribute": "content"
          }
        ],
        "type": [
          {
            "selector": "meta[property='octo:type']",
            "attribute": "content"
          }
        ]
      },
      "hashtag": {
        "s": "source",
        "o": [
          {
            "selector": "octo-thorpe",
            "attribute": "textContent"
          },
          {
            "selector": "a[rel='octo:octothorpes']",
            "attribute": "href",
            "postProcess": {
              "method": "regex",
              "params": "https://octothorp.es/~/([^/]+)"
            }
          },
          {
            "selector": "link[rel='octo:octothorpes']",
            "attribute": "href"
          }
        ]
      },
      "link": {
        "s": "source",
        "o": [
          {
            "selector": "a[rel='octo:octothorpes']:not([href*='https://octothorp.es/~/'])",
            "attribute": "href"
          }
        ]
      },
      "endorse": {
        "s": "source",
        "o": [
          {
            "selector": "[rel='octo:endorses']:not([href*='https://octothorp.es/~/'])",
            "attribute": "href"
          }
        ]
      },
      "bookmark": {
        "s": "source",
        "o": [
          {
            "selector": "[rel='octo:bookmarks']:not([href*='https://octothorp.es/~/'])",
            "attribute": "href"
          }
        ]
      },
      "cite": {
        "s": "source",
        "o": [
          {
            "selector": "[rel='octo:cites']:not([href*='https://octothorp.es/~/'])",
            "attribute": "href"
          }
        ]
      }
    }
  }
}
```


And here's what it looks like using the `keywords` harmonizer.

[https://octothorp.es/debug/orchestra-pit?uri=https://demo.ideastore.dev&as=keywords](https://octothorp.es/debug/orchestra-pit?uri=https://demo.ideastore.dev&as=keywords)



```json
{
  "@id": "https://demo.ideastore.dev",
  "title": "Home - Octothorpes Demo",
  "description": "Welcome to the demonstration site for the Octothorpes protocol. Here you can see standard octothorpes and [backlinks](/backlinked-page) in action, plus some suggestions for [shorthand](/shorthand) methods of making them.",
  "image": "https://demo.ideastore.dev/assets/octomark.png",
  "contact": "",
  "type": "",
  "octothorpes": [
    {
      "type": "link",
      "uri": "https://ideastore.dev/blog/why-tho"
    },
    {
      "type": "link",
      "uri": "https://demo.ideastore.dev/backlinked-page"
    },
    {
      "type": "link",
      "uri": "https://demo.ideastore.dev/tags-and-octothorpes"
    },
    {
      "type": "link",
      "uri": "https://demo.ideastore.dev/shorthand"
    },
    {
      "type": "link",
      "uri": "https://demo.ideastore.dev/synonyms"
    },
    {
      "type": "endorse",
      "uri": "https://octothorpenty.glitch.me"
    }
  ],
  "harmonizerUsed": {
    "@context": "https://octothorp.es/context.json",
    "@id": "https://octothorp.es/harmonizer/keywords",
    "@type": "harmonizer",
    "title": "Meta Kewords to Octothorpes Harmonizer",
    "mode": "html",
    "schema": {
      "hashtag": {
        "s": "source",
        "o": [
          {
            "selector": "meta[name='keywords']",
            "attribute": "content",
            "postProcess": {
              "method": "split",
              "params": ","
            }
          }
        ]
      }
    }
  }
}

```

As you can see, we can specify different harmonizers using the `as` parameter. You can use a harmonizer id as shorthand if it exists on the server, otherwise you have to provide a valid url to a well-formed harmonizer definition.

**Custom cases**

Let's say that your blog uses the class `look-a-tag` on the standard `a` element. Why? Who knows? We don't judge, we just harmonize. You could easily write a harmonizer to find that.

> TKTK more examples to come
