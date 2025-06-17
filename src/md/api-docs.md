```
const MultiPass = {
    meta: {
        nickName: string, anything
        author: string, anything
        image: "url",
        version: "1.x",
        shouldReturn: string (blobjects, triples ),
        instance: string, url to server,
        format: optional, RSS, WebMention, raw?

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
        limit: "int",
        offset: "int",
        dateRange: { 
            after: Date,
            before: Date,
        }
    }
}
```