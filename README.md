![release badge](https://img.shields.io/github/v/release/stucco-software/octothorp.es)
# Octothorpe Protocol Server #️⃣♥️#️⃣

A relay that connects independent websites with Octothorpe Protocol. Implements OP core features and includes a limited front-end UI.

- [Documentation](https://docs.octothorp.es)
- [Main OP Server](https://octothorp.es)
- [Demo site](https://demo.idestore.dev)

## Local Development

```
❯ cp .env.example .env
```

**Note:** A connection to on OP-compatible datastore is required. For full-local development, see [octothorpes-suite](https://github.com/stucco-software/octothorpes-suite). Otherwise, credentials for a hosted instance will be required in `.env`

Start the local dev server:

```
❯ npm run dev
````

Visit the Site UI:

[http://localhost:5173/](http://localhost:5173/)

## Relay links and endpoints
- Domains: `http://localhost:5173/domains`
- Hashtags: `http://localhost:5173/~/`
- Test indexing a page: `http://localhost:5173/debug/orchestra-pit?uri=FULL-TEST-URL-HERE`
- Example API endpoint: `http://localhost:5173/get/everything/posted/debug?s=demo.ideastore.dev` See the [API docs](https://docs.octothorp.es/op-api/) for more  
