# Octothorpes

## Local Development

Start the docker container for Oxigraph:
```
❯ docker compose build
❯ docker compose up
```
Oxigraph UI:
http://0.0.0.0:7878/

Start the local dev server for the Octothorpes UI:
```
❯ npm run dev
````

Visit the Site UI:
http://localhost:5173/

Start the static site demo server so our local octothorpes ring has a member site:
```
❯ npm run dev
```

### Register a Local Ring

To add the demo site – or any other site – to the local Ring;

1. visit the Oxigraph UI.
2. Change the query URL from `http://localhost:7878/query` to `http://localhost:7878/update`
3. Past the following SPARQL query:

```
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX octo: <https://vocab.octothorp.es#>

insert data {
  <http://localhost:8888/> octo:verified "true" .
  <http://localhost:8888/> rdf:type <octo:Origin> .
}
```

4. Hit the big arrow 'Go' button.

## Get Unverified Domains & Challenges

```
PREFIX oc: <http://opencoinage.org/rdf/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX octo: <https://vocab.octothorp.es#>

select * {
  ?d rdf:type <octo:Origin> .
  ?d octo:verified "false" .
  ?d octo:challenge ?c .
}
```
