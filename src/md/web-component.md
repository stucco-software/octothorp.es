---
type: Documentation
---

# Creating Octothorpes with the Web Component

The Octothorpes Web Component is a Custom Element that registers your pages tag with a Community Server, and displays all other pages that are connected that tag.

## Include the Component Script

Add the Web Component script to your page, making sure to add the `data-register` attribute to connect to any Community Server's your domain is verified with.

```
<script
  async="" defer="" type="module"
  data-register="https://octothorp.es"
  src="https://octothorp.es/tag.js"></script>;
```