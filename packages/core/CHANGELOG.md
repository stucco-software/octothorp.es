# Changelog

## 0.2.4

- Adds `standardSite` as a named harmonizer. Note that this uses a `documentRecord` to contain the non-standard content, which, in the current version of OP, will not be stored.

## 0.2.3

- Fix `documentRecord` selector bug in `harmonizeSource`: was iterating over `schema.subject` instead of `schema[key]`, causing documentRecord properties to use the wrong CSS selectors.

## 0.2.2

- Fix date filters using `COALESCE` fallback in `createDateFilter` so queries match on either `postDate` or `date` when filtering by date range.

## 0.2.1

- Add Bluesky publisher (`bluesky`): transforms blobjects into `app.bsky.feed.post` records with grapheme-aware truncation, UTF-8 byte-offset facets for links and tags.
