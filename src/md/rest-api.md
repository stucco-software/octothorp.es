---
type: Documentation
prefLabel: REST API
---

You can fetch any Tag as a JSON object via a `GET` request against the tags URL:

```
curl -X GET \
  -H "Content-type: application/json" \
  -H "Accept: application/json" \
  "<ring>/~/<tag>"
```

### GET `https://octothorp.es/`

Fetches information about the Ring.

Response: 
```
{
  "instance": "https://octothorp.es/"
}
```

### GET `https://octothorp.es/domains`

Fetches a list of verified domains that are part of the Ring.

Response: 
```
{
  "domains": […]
}
```

### GET `https://octothorp.es/domains/<domain>`

Fetches all pages, octothorpes, and backlinks associated with a domain.

Response: 
```
{
  "uri": <domain>,
  "octothorpes": […]
}
```

### GET `https://octothorp.es/~`

Fetches all the terms present on a Ring.

Response: 
```
{
  "octothorpes": […]
}
```

### GET `https://octothorp.es/~/<term>`

Fetches all the URLs that octothorpe a given Term.

Response: 
```
{
  "uri":"https://octothorp.es/~/<term>",
  "octothorpedBy": […url]
}
```

### GET `https://octothorp.es/index?uri=<uri>`

Submits a given uri for indexing on the Ring.

Response:
```
200
```