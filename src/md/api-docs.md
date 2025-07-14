---
type: Documentation
prefLabel: OP API Documentation PREVIEW
---





> **DRAFT DO NOT SHARE**


## Overview

**Build your own algorithm**. The new OP API allows you to create dynamic feeds from different, independent websites with complex filtering and grouping methods. Make custom JSON or RSS feeds based on phrases, hashtags, webring membership, originating or target url, with date filtering, fuzzy or exact matching, and the ability to *exclude* any of the same types of values.


The Octothorpes Protocol API is about getting statements *out* of the database.

Common use cases include:
- simply following a hashtag
- getting a list of all links to your site
- following all new posts across a webring you belong to
- following all the posts from a group of unrelated urls that use the same hashtag (even if they each spell it slightly differently)
- creating a live-updating blogroll or list of members of a webring

Worth mentioning is that OP is **not** a search engine or a crawler. OP servers only index pages that actively request it, so it is so far unaffected by many common issues with low-quality results from contemporary search engines.

**How do I get data in?**

You create or update statements by asking an OP server to index a webpage you own with markup on it that can be recognized by the server. See the [quickstart guide](https://demo.ideastore.dev/quickstart) or [the current, slightly outdated documentation on how to do that.](https://octothorp.es/docs)

> **Why is it out of date?**
> OP now uses the concept of a Harmonizer to allow you to define your own methods of adding octothorpes to your website. This means you don't necessarily have to change anything in your own markup to use octothorpes as long as you can create a harmonizer that consistently identifies them. **Harmonizer doc is TKTK as of 7.1.25** but you can see the [default harmonizer in action here](https://octothorp.es/debug/orchestra-pit?uri=https://demo.ideastore.dev) if you'd like to infer how they work.


## Relevant RDF concepts

Chunks of data are referred to as "statements" in OP because the database is an RDF triplestore. It is hosted on an Oxigraph server which uses SPARQL queries to retrieve statements as JSON. The OP API provides a GET endpoint that builds dynamic SPARQL queries using routes and url params and returns them as structured JSON objects.



### Subjects and Objects

Every triple has a `subject` and an `object`

The base statement in OP is that a `subject` `octothorpes` an `object`

"Hashtags" are when a `subject` `octothorpes` an `object` that is identified by a url for a `Term` on an OP server such as [https://octothorp.es/~/demo](https://octothorp.es/~/demo)

Since there are so many synonyms for "hashtag", the technical label for them in OP is `Term` as they are completely separate RDF types from URLs that represent webpages. In the database it looks like this:

`<https://octothorp.es/~/demo> rdf:Type <octo:Term>`

whereas a subject that points to any other type of public URL is `rdf:Type <octo:Page>`


> Octothorpe relationships to `Terms` are treated as hashtags and referred to simply as "octothorpes"
>
> Octothorpe relationships to `Pages` are `Links`, which have subtypes such as `Bookmarks`

In the API, you filter for subjects and objects using the `s` and `o` url parameters (or `not-s` or `not-o` to exclude). Most endpoints require at one or more value, with some special cases requiring only one value.


### MultiPass

Every valid query is represented as a JSON object called a `MultiPass`, and the codebase has public functions that can accept Multipasses directly.

```json

const multiPass = {
    meta: {
        title: string,
        description: string,
        server: URL of Octothorpes server to query,
        author: string,
        image: "url",
        version: int (for versioning modified MultiPasses),
        resultMode: string (blobjects, lists )
    },
    subjects: {
        mode: string (exact, fuzzy, byParent)
        include: comma-separated strings -- well-formed urls default to exact matches, non-urls default to fuzzy
        exclude: comma-spearated -- well-formed urls default to exact matches, non-urls default to fuzzy
    },
    objects: {
        type: string -- (termsOnly, pagesOnly, all)
        mode: "fuzzy",
        include: [],
        exclude: []
    },
    filters: {
        subtype, string,
        limitResults: "int",
        offsetResults: "int",
        dateRange: {
            after: Date,
            before: Date,
        }
    }
}
```


## URL Structure

`https://octothorp.es/get/[what]/[by]/[[as]]`

- `[what]` - What type of data to retrieve

- `[by]` - How to filter or match the data

- `[[as]]` - Optional output format (defaults to JSON)

`[what]` has two formats for what it returns -- **blobjects** or lists.

### Everything = Blobjects

`get/everything` will return blobjects -- hybrid, structured json objects that contain URI-level data for the pages returned *as well* as all of their octothorpes with their attached information, such as type (`link`, `backlink` etc)

Example: [https://octothorp.es/get/everything/posted?s=demo](https://octothorp.es/get/everything/posted?s=demo)
### Specific things = lists

`get/thorpes` or `get/pages` will return a flat list of matching pages and data that only applies directly to their URL.

Example: [https://octothorp.es/get/pages/posted?s=demo](https://octothorp.es/get/pages/posted?s=demo)

## Available Endpoints

For a continuously updated overview of the state of all the endpoints on the API, see this [Google Sheet](https://docs.google.com/spreadsheets/d/1TdV3UAvgqQBxl4US5Sii6cWdyWuaUD2SfiPBxX2QPoo/edit?usp=sharing).
### Data Types (`[what]`)



| Type         | Description                          | Returns                                         |
| ------------ | ------------------------------------ | ----------------------------------------------- |
| `everything` | Complete blobjects with all metadata | Blobjects (pages with octothorpes, links, etc.) |
| `pages`      | List of pages/URLs                   | Pages List                                      |
| `thorpes`    | List of octothorpes/terms            | Terms List                                      |
| `domains`    | List of domains                      | Pages List, domains only                        |
|              |                                      |                                                 |




### Query Methods (`[by]`)



| Method       | Description                             | Subject Type     | Object Type |
| ------------ | --------------------------------------- | ---------------- | ----------- |
| `thorped`    | Pages tagged with specific Terms        | Originating Page | Term        |
| `linked`     | Pages that link to other pages          | Originating Page | Linked Page        |
| `backlinked` | Same as linked, scoped to validated backlinks | Originating Page | Page        |
| `bookmarked` | Same as linked, scoped to subtype Bookmark               | Originating Page | Linked Page        |
| `posted`     | Any Pages indexed (no object filter)    | Originating Page | N/A         |
| `in-webring` | Pages within a specific webring         | Parent Webring (req)  | Term (opt)   |



### Output Formats (`[[as]]`)



| Format  | Description                          | Status    |
| ------- | ------------------------------------ | --------- |
| `json`  | JSON response (default)              | Available |
| `rss`   | RSS 2.0 feed                         | Untested  |
| `debug` | Debug information with query details | Available |



## Query Parameters



### Core Parameters



| Parameter | Type         | Description                    | Default                 |
| --------- | ------------ | ------------------------------ | ----------------------- |
| `s`       | String/Array | Subject URLs or terms to match | None (required)         |
| `o`       | String/Array | Object URLs or terms to match  | None (required)         |
| `match`   | String       | Matching strategy              | `exact`  |



### Filtering Parameters



| Parameter | Type    | Description               | Default |
| --------- | ------- | ------------------------- | ------- |
| `limit`   | Integer | Maximum number of results | 100     |
| `offset`  | Integer | Number of results to skip | 0       |
| `when`    | String  | Date/time filter          | None    |



### Matching Strategies (`match` parameter)



| Strategy       | Description                               | Match Strategy                                                                                                             |
| -------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `exact`        | Exact URL/term matching                   | Uses the exact param as a SPARQL URI                                                                                       |
| `fuzzy-s`      | Fuzzy matching only on subject            | Uses param as a string to match records using a CONTAINS query only for subject (inclusion or exclusion), exact for object |
| `fuzzy-o`      | Fuzzy matching only on object             | Exact matches of common variations of terms as URIs (ie: hashtag, HashTag, #hashtag, hash tag), Exact for Subject          |
| `fuzzy`        | Fuzzy matching on both subject and object | Fuzzy match for both s and o                                                                                               |
| `very-fuzzy-o` | Very loose object matching                | Matches common variations of terms using a CONTAINS query (can be slow)                                                    |

### Inferred matching



The API will infer some match formats based on the structure of the submitted values for `s` and `o`:

- **Well-formed URLs starting with https://** → `exact` matching

- **Strings** → `fuzzy` matching

- **Match param value** → Setting the `match` parameter overrides any applicable default

> WARNING: At the moment, `very-fuzzy` matching will run *very* slowly when paired with a date filter.


### Date Filtering (`when` parameter)



| Format | Description | Example |
|--------|-------------|---------|
| `recent` | Last 2 weeks | `when=recent` |
| `after-DATE` | After specific date | `when=after-2024-01-01` |
| `before-DATE` | Before specific date | `when=before-2024-12-31` |
| `between-DATE-and-DATE` | Date range | `when=between-2024-01-01-and-2024-12-31` |



Date formats accepted:

- Unix timestamp: `1704067200`
- ISO date: `2024-01-01`




## Examples



### Get all pages tagged with "demo"



[https://octothorp.es/get/everything/thorped?o=demo](https://octothorp.es/get/everything/thorped?o=demo)





### Get pages that link to any page on a certain domain

> *Note:* using domain as a string rather than a well-defined url will run as a fuzzy match, returning results for all urls on that domain rather than that exact url

[https://octothorp.es/get/pages/linked?o=demo.ideastore.dev](https://octothorp.es/get/pages/linked?o=demo.ideastore.dev)




### Get recent bookmarks with fuzzy matching

> TKTK no good bookmark data right now. waiting for support of Terms on Bookmarks

### Get pages in a webring hashtagged "demo"


[https://octothorp.es/get/everything/members?s=https://demo.ideastore.dev/demo-webring&o=demo](https://octothorp.es/get/everything/members?s=https://demo.ideastore.dev/demo-webring&o=demo)



### Get RSS feed of tagged content



[https://octothorp.es/get/everything/thorped/rss?o=demo&limit=20](https://octothorp.es/get/everything/thorped/rss?o=demo&limit=20)





### Debug a query



[https://octothorp.es/get/everything/thorped/debug?o=demo&match=fuzzy](https://octothorp.es/get/everything/thorped/debug?o=demo&match=fuzzy)

This returns the MultiPass created from the request params, the literal SPARQL query generated from the MultiPass, and the actual results of the query in the following object:

```json
{
  "results": {
    "multiPass": {},
    "query": {},
    "actualResults": {}
  }
}
```

## Response Formats



### [Blobjects / Everything](https://octothorp.es/get/everything/posted?s=demo)



```json
{
  "results": [
    {
      "@id": "https://demo.ideastore.dev/multi-platform",
      "title": "Octothorpe Anywhere - Octothorpes Demo",
      "description": "Implementing Octothorpes is really easy. Here are some sites on other platforms that already have it.",
      "image": null,
      "date": 1740179856134,
      "octothorpes": [
        "demo",
        "wordpress"
      ]
    },
    {
      "@id": "https://demo.ideastore.dev/assertions",
      "title": "Assertions - Octothorpes Demo",
      "description": "Statements about urls other than the page you're on are called Assertions",
      "image": null,
      "date": 1740180203218,
      "octothorpes": [
        "etymology",
        "oof",
        "assertions",
        "octothorpe"
      ]
    },
    {
      "@id": "https://demo.ideastore.dev/page%20with%20spaces",
      "title": "Page with Spaces in URL - Octothorpes Demo",
      "description": "This page uses an alternate server, which can easily be set with a page variable.",
      "image": null,
      "date": 1740190020861,
      "octothorpes": [
        "testing",
        "demo"
      ]
    },
    ...
    ]
}
```



### [Pages List](https://octothorp.es/get/pages/posted?s=demo)



```JSON
{
  "results": [
    {
      "uri": "https://demo.ideastore.dev/multi-platform",
      "title": "Octothorpe Anywhere - Octothorpes Demo",
      "description": "Lorem!.",
      "date": 1740179856134,
      "image": null
    },
    {
      "uri": "https://demo.ideastore.dev/assertions",
      "title": "Assertions - Octothorpes Demo",
      "description": "Lorem ipsum",
      "date": 1740180203218,
      "image": null
    },
    {
      "uri": "https://demo.ideastore.dev/page%20with%20spaces",
      "title": "Page with Spaces in URL - Octothorpes Demo",
      "description": "Morem ipsum",
      "date": 1740190020861,
      "image": null
    }
  ]
}
```



### [Terms List](https://octothorp.es/get/pages/posted?s=demo)



```json

{
  "results": [
    {
      "term": "demo",
      "date": 1739540092164
    },
    {
      "term": "backlinks",
      "date": 1739540092166
    },
    {
      "term": "demo",
      "date": 1739547523260
    },
    {
      "term": "xoxofest",
      "date": 1739547523663
    },
    ...
    ]
  }

```



### [Debug Response](https://octothorp.es/get/pages/posted/debug?s=demo)



```json

{
  "multiPass": {
    "meta": {
      "title": "Get blobjects matched by all (posted) as blobjects",
      "description": "MultiPass auto generated from a request to the https://octothorp.es//get API",
      "server": "https://octothorp.es/",
      "author": "Octothorpes Protocol",
      "image": "https://octothorp.es/badge.png",
      "version": "1",
      "resultMode": "blobjects"
    },
    "subjects": {
      "mode": "fuzzy",
      "include": [
        "demo"
      ],
      "exclude": []
    },
    "objects": {
      "type": "all",
      "mode": "exact",
      "include": [],
      "exclude": []
    },
    "filters": {
      "subtype": "",
      "limitResults": "100",
      "offsetResults": "0",
      "dateRange": {}
    }
  },
  // line breaks added to query here for readability
  "query": "SELECT DISTINCT
  ?s ?o ?title ?description ?image ?date ?pageType ?ot ?od ?oimg
      WHERE {    VALUES ?subList { \"demo\" }
        FILTER(CONTAINS(STR(?s), ?subList))
        ?s octo:indexed ?date .
        ?s rdf:type ?pageType .
        ?s octo:octothorpes ?o .
        OPTIONAL { ?s octo:title ?title . }
        OPTIONAL { ?s octo:image ?image . }
        OPTIONAL { ?s octo:description ?description . }
        OPTIONAL { ?o octo:title ?ot . }
        OPTIONAL { ?o octo:description ?od . }
        OPTIONAL { ?o octo:image ?oimg . }  }
        ORDER BY ?date",
  "actualResults": [
    {
      "uri": "https://demo.ideastore.dev/multi-platform",
      "title": "Octothorpe Anywhere - Octothorpes Demo",
      "description": "lorem ipsum.",
      "date": 1740179856134,
      "image": null
    },
    {
      "uri": "https://demo.ideastore.dev/assertions",
      "title": "Assertions - Octothorpes Demo",
      "description": "lorem ipsum",
      "date": 1740180203218,
      "image": null
    },
        ...
    ]
  }


```




### Special Cases



- **Webrings**: Always use exact matching for webring URLs

- **Terms**: Default to exact matching for octothorpe terms


## Error Handling



The API returns (some) appropriate HTTP status codes:



- `200` - Success
- `500` - Server error

### TKTK:

- `400` - Invalid parameters

- `404` - No results found

*Note*: descriptive errors currently only report in dev console



## Rate Limiting



Currently, the API has generous rate limits. Please be respectful and avoid making excessive requests.



## CORS



The API supports CORS and can be used from web applications. All endpoints include the `Access-Control-Allow-Origin: *` header.



## Versioning



This documentation covers API version 0.5 Breaking changes may occur until 1.0 but we're trying to avoid that.



## Support



For questions or issues with the API, please open an issue on Github or contact Nik or Nim directly.
