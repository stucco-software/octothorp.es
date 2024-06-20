---
type: Documentation
prefLabel: Endorsing Backlinks
---

In order to be recorded in the Ring, a pages need to endorse backlinks. Any page can endorse backlinks from any origin by including a `<link>` tag in the the `<head>` of the page.

```
<link 
  rev="octo:octothorpes" 
  href="*">
```

Pages can limit the domains they endorse backlinks from:

```
<link 
  rev="octo:octothorpes" 
  href="https://originating-site.com">
```

That tells the Octothorpe server that you endorse links originating from the specified URL, and they’ll be registered as backlinks.