# Octothorpes

## ToDo

- [x] set up emailer
- [x] email admin when domain registers
- [ ] email admin when new thorpe created
- [ ] simple admin interface for approving/banning domains
- [ ] simple admin interface for banning thorpes
- [ ] re-use origin checker for cleaning up thorpes async


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

## Check if the TXT header has been added

```
❯ dig -t txt example.com +short
```