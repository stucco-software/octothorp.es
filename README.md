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

---
# Draft documentation for Future Wiki
---

*this is aspirational and incomplete. maybe I should put this in an issue instead?*


Link reference usage:

`[link text][#term (predicate object)]`

shorthand:
`[[(#)term]]`

### Local and remote terms

- using a term term registers it with local parser
- for each registered server parser says `localnamespace/~/term = server/~/term`
- default is same local as server

### Term Proxies

manually proxy a term by setting `localnamespace/~/term2 = server/~/term1`
that lets you do something like 

set: 

```
term1 = server1/~/term1
proxy([term2, term3], term1) 
```

usage:

```
[[term2]] Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi aliquam laoreet metus, id elementum tellus vulputate et. Mauris eros est, pulvinar vitae condimentum ac,

[[term3]] Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi aliquam laoreet metus
```

^ both octothorpe term1


Upstream, that also lets you proxy one local term to multiple remote terms if you subscribe to multiple servers that don't share vocabularies

```
term1 = server1/~/term1
term2 = server2/~/eggplant

proxy([term], [term1, term2]) 

```
