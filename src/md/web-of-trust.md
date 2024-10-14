---
type: Documentation
prefLabel: Web of Trust
draft: true
ticket: https://github.com/orgs/stucco-software/projects/3?pane=issue&itemId=82992136
---

Any domain that is verified on an Octothorpes Ring can endorse another domain, automatically verifying the new domain. 

To endorse another domain, add a `<link>` tag to a page on your website. 

```
<link
  rel="octo:endorses"
  href="https://endorsed.example.com">
```