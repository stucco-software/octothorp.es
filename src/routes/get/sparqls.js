
// ### base everything query, accepts arrays of subjects and objects

```SELECT DISTINCT ?s ?o ?title ?description ?image ?date ?pageType ?ot ?od ?oimg ?blankNode ?blankNodePred ?blankNodeObj
WHERE {

    ${subjectStatement}

    ${objectStatement}

  # Core subject info
  ?s octo:indexed ?date .
  ?s rdf:type ?pageType .

  # Core triple: subject -> octothorpes -> object 
  ?s octo:octothorpes ?o .

  # Object type
  ${objectType}

  # Optional blank node exploration

  OPTIONAL {
    ?o ?blankNodePred ?blankNode .
    FILTER(isBlank(?blankNode))
    OPTIONAL {
      ?blankNode ?bnp ?blankNodeObj .
      FILTER(!isBlank(?blankNodeObj))
    }
  }

  # Optional properties
  OPTIONAL { ?s octo:title ?title . }
  OPTIONAL { ?s octo:image ?image . }
  OPTIONAL { ?s octo:description ?description . } 
  OPTIONAL { ?o octo:title ?ot . } 
  OPTIONAL { ?o octo:description ?od . } 
  OPTIONAL { ?o octo:image ?oimg . } 
  ```

  // To add to blobject
  /*
    - object title
    - object description
    - object image
    - object hashtag << bookmarks, etc
    - date
    - subject image
    - review how documentRecord is working on mentions
  */
// Only as child of specified url

 ``` # Input: Parent URI (e.g., <https://example.org/parent>)
  BIND(<https://demo.ideastore.dev> AS ?parent)

  # Find all subjects (?s) where ?parent hasPart ?s
  ?parent octo:hasPart ?s .```

// Octothorpes

`?o rdf:type <octo:Term> .`

// Links

`?o rdf:type <octo:Page> .` // >>> Curious if this doesn't match octo:Origin


// for exact, use urls and no contains

```WHERE {
  VALUES ?s { 
    <https://demo.ideastore.dev>
    <https://demo.ideastore.dev/backlinked-page>
    <https://mmmx.cloud/buckmanite> 
  }

  # Exact object URIs (array)
  VALUES ?o {
    <https://octothorp.es/~/demo>
    <https://octothorp.es/~/Buckman>
  }```



// Subject options

const fuzzySubject = ``` VALUES ?subList { ${subjectList} }
  FILTER(CONTAINS(STR(?s), ?subList))```

const exactSubject = ```VALUES ?subList { ${subjectList} }```

// must be exact
const byParent = ``` VALUES ?parents { ${subjectList} }
?parents octo:hasPart ?s .```

// Object Options

const fuzzyObject = ``` VALUES ?objList { ${objectArray} }
  FILTER(CONTAINS(STR(?o), ?objList))```

const exactObject = ``` VALUES ?objList { ${objectArray} }```


// Type options

const termsOnly = `?o rdf:type <octo:Term> .`
const linksOnly = `?o rdf:type <octo:Page> .`
