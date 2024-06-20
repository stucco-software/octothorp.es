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