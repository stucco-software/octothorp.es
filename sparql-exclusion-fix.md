# SPARQL Object Exclusion Fix - October 2025

## Problem Summary

Object exclusions in `buildObjectStatement` were not working correctly. When excluding octothorpes (e.g., "exclude pages with Remix"), the system was still returning pages that had both included and excluded terms.

## Root Cause

The original exclusion logic used `FILTER(?o NOT IN (?excludedObjects))`, which only filtered individual `?o` bindings, not entire pages/subjects.

### Example of the Bug

**MultiPass configuration:**
- Include: pages with "weirdweboctober"
- Exclude: pages with "Remix"

**What happened:**
1. Phase 1 query would match pages with "weirdweboctober"
2. If a page had BOTH "weirdweboctober" AND "Remix", it would still pass because:
   - `?o` would bind to "weirdweboctober"
   - `FILTER(?o NOT IN (<.../Remix>))` would pass (since "weirdweboctober" ≠ "Remix")
3. The page would be included even though it had the excluded term

**What should happen:**
Pages with BOTH tags should be excluded entirely because they have "Remix" somewhere.

## The Fix

Changed from checking individual bindings to checking if the subject/page has ANY relationship to excluded objects.

### Before (buildObjectStatement lines 246-268)

```javascript
case 'exact':
  excludeStatement = `VALUES ?excludedObjects { ${processTermObjects(excludeList)} } FILTER(?o NOT IN (?excludedObjects))`
  break
case 'fuzzy':
  if (type === "termsOnly") {
    const processedExclude = processTermObjects(excludeList, "fuzzy")
    excludeStatement = `VALUES ?excludedObjList { ${processedExclude.map(o => `"${o}"`).join(' ')} }
           FILTER(!CONTAINS(STR(?o), ?excludedObjList))`
  }
  else {
    excludeStatement = `VALUES ?excludedObjList { ${excludeList.map(o => `"${o}"`).join(' ')} }
           FILTER(!CONTAINS(STR(?o), ?excludedObjList))`
  }
  break
case 'very-fuzzy':
  const veryFuzzyExclude = processTermObjects(excludeList, "very-fuzzy")
  excludeStatement = `VALUES ?excludedObjList { ${veryFuzzyExclude.map(o => `"${o}"`).join(' ')} }
           FILTER(!CONTAINS(STR(?o), ?excludedObjList))`
  break
```

### After (buildObjectStatement lines 246-277)

```javascript
case 'exact':
  excludeStatement = `FILTER NOT EXISTS {
    VALUES ?excludedObjects { ${processTermObjects(excludeList)} }
    ?s octo:octothorpes ?excludedObjects .
  }`
  break
case 'fuzzy':
  if (type === "termsOnly") {
    const processedExclude = processTermObjects(excludeList, "fuzzy")
    excludeStatement = `FILTER NOT EXISTS {
      VALUES ?excludedObjList { ${processedExclude.map(o => `"${o}"`).join(' ')} }
      ?s octo:octothorpes ?excludedObj .
      FILTER(CONTAINS(STR(?excludedObj), ?excludedObjList))
    }`
  }
  else {
    excludeStatement = `FILTER NOT EXISTS {
      VALUES ?excludedObjList { ${excludeList.map(o => `"${o}"`).join(' ')} }
      ?s octo:octothorpes ?excludedObj .
      FILTER(CONTAINS(STR(?excludedObj), ?excludedObjList))
    }`
  }
  break
case 'very-fuzzy':
  const veryFuzzyExclude = processTermObjects(excludeList, "very-fuzzy")
  excludeStatement = `FILTER NOT EXISTS {
    VALUES ?excludedObjList { ${veryFuzzyExclude.map(o => `"${o}"`).join(' ')} }
    ?s octo:octothorpes ?excludedObj .
    FILTER(CONTAINS(STR(?excludedObj), ?excludedObjList))
  }`
  break
```

## Secondary Fix: Operator Precedence Bug

Fixed a JavaScript operator precedence issue in `buildEverythingQuery` at line 481.

### Before
```javascript
if (!subjectList.include.length > 0 && !subjectList.exclude.length > 0) {
```

This evaluated as `(!subjectList.include.length) > 0`, which was always true.

### After
```javascript
if (!subjectList.include?.length && !subjectList.exclude?.length) {
```

## How the Fix Works

### SPARQL `FILTER NOT EXISTS` Pattern

Instead of filtering the current `?o` binding, we check if the subject has ANY triple matching the excluded pattern:

```sparql
FILTER NOT EXISTS {
  VALUES ?excludedObjects { <https://octothorp.es/~/Remix> }
  ?s octo:octothorpes ?excludedObjects .
}
```

This means: "Exclude subject `?s` if there EXISTS a triple where `?s octo:octothorpes <.../Remix>`"

## Test Case

**Input MultiPass:**
```json
{
  "objects": {
    "type": "termsOnly",
    "mode": "exact",
    "include": ["weirdweboctober"],
    "exclude": ["Remix"]
  }
}
```

**Expected behavior:**
- Page with only "weirdweboctober": ✓ Included
- Page with both "weirdweboctober" AND "Remix": ✗ Excluded
- Page with only "Remix": ✗ Excluded

**Generated SPARQL (Phase 1 - buildSimpleQuery):**
```sparql
SELECT DISTINCT ?s ?o ?title ?description ?image ?date ?pageType ?ot ?od ?oimg
WHERE {
  VALUES ?o { <https://octothorp.es/~/weirdweboctober> }
  FILTER NOT EXISTS {
    VALUES ?excludedObjects { <https://octothorp.es/~/Remix> }
    ?s octo:octothorpes ?excludedObjects .
  }
  ?s octo:octothorpes ?o .
  ?o rdf:type <octo:Term> .
  ?s octo:indexed ?date .
  ?s rdf:type ?pageType .
  OPTIONAL { ?s octo:title ?title . }
  OPTIONAL { ?s octo:image ?image . }
  OPTIONAL { ?s octo:description ?description . }
  OPTIONAL { ?o octo:title ?ot . }
  OPTIONAL { ?o octo:description ?od . }
  OPTIONAL { ?o octo:image ?oimg . }
}
ORDER BY DESC(?date)
LIMIT 50
```

## Why Subject Exclusions Weren't Changed

Subject exclusions using `FILTER(?s NOT IN (?excludedSubjects))` are correct because:
- `?s` represents the actual page URI being checked
- We're directly excluding those specific subjects
- Unlike objects where we want to exclude pages *that have* certain objects, for subjects we're excluding the subjects themselves
- The `byParent` mode already uses `FILTER NOT EXISTS` pattern correctly

## Files Modified

- `/src/lib/sparql.js` - `buildObjectStatement` function (lines 243-277)
- `/src/lib/sparql.js` - `buildEverythingQuery` function (line 481)

## Testing

To verify the fix works:

1. Use the test multiPass in `test-exclusion.js`
2. Check that Phase 1 query includes the `FILTER NOT EXISTS` pattern
3. Verify that pages with both included and excluded terms are not returned

## Related Functions

- `buildObjectStatement` - Creates SPARQL fragments for object filtering (include/exclude)
- `buildSubjectStatement` - Creates SPARQL fragments for subject filtering (not modified)
- `buildSimpleQuery` - Phase 1 query that uses these statements to filter subjects
- `buildEverythingQuery` - Phase 2 query that retrieves all data for filtered subjects
- `prepEverything` - Orchestrates the two-phase query process

## Key Insight

The two-phase query pattern in `buildEverythingQuery`:
1. **Phase 1** (`prepEverything` → `buildSimpleQuery`): Filter subjects based on include/exclude criteria
2. **Phase 2** (`buildEverythingQuery`): Get all blobject data for those filtered subjects

The exclusion logic MUST work correctly in Phase 1, because Phase 2 intentionally retrieves everything about the subjects that passed Phase 1.
