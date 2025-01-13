## Harmonizers
1. on this url: https://www.mollywhite.net/micro/entry/202411211431

2. register with the ring and request indexing:
```
<link
  rel="preload"
  as="fetch"
  href="https://octothorp.es/?uri=https://www.mollywhite.net/micro/entry/202411211431">
```

3. Then on that page add
```
  <meta name="octo:harmonizer" content="[rel='category tag']">
```

### But What if We Can't Adjust the HTML?

I DONT KNOW. This means there wont be any passive indexing via the fetch preload, so having active indexing precludes this question.

### What about assertions?

Lets look at waxy.org: https://waxy.org/category/links/

This is a huge pile of links from s => o. We can harmonize them with the selector

```
<meta
  name="octo:harmonizer" content=".entry-content .link-title a"
>
```

But that will clock them all as backlinks. And since those links wont be part of the ring or endorse waxy.org, they wont get added to the graph at all.

So they _should_ be added as bookmarks, but bookmarks need a tag!

```
// https://waxy.org/category/links/
<link
  rel="preload"
  as="fetch"
  href="https://octothorp.es
    ?uri=https://aaronson.org/blog/crossword-calendar
    &octothorpes=bookmark>"
>
```

That would be simple enough for Andy to add to his template if he wanted to, but maybe he doesn't? Maybe then we add a harmonzer for bookmarks:

```
<meta
  name="octo:bookmark"
  content=".entry-content .link-title a"
>
```

And we end up adding a default hashtag to the bookmark, which would be #octothorpes?
