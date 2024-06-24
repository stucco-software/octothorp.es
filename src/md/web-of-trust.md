---
type: Documentation
prefLabel: Web of Trust
draft: true
---

Any domain that is verified on an Octothorpes Ring can endorse another domain, automatically verifying the new domain. 

To endorse another domain, add a `<link>` tag to a page on your website. 

```
<link
  rel="octo:endorses"
  href="https://endorsed.example.com">
```