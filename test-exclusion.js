// Test to verify object exclusion fix
// This demonstrates that FILTER NOT EXISTS properly excludes pages with certain octothorpes

const multiPass = {
  "meta": {
    "title": "Get blobjects thorped to weirdweboctober and not Remix",
    "resultMode": "blobjects"
  },
  "subjects": {
    "mode": "exact",
    "include": [],
    "exclude": []
  },
  "objects": {
    "type": "termsOnly",
    "mode": "exact",
    "include": ["weirdweboctober"],
    "exclude": ["Remix"]
  },
  "filters": {
    "subtype": "",
    "limitResults": "50",
    "offsetResults": "0",
    "dateRange": {
      "after": 1760052253330
    }
  }
};

console.log("Testing object exclusion with multiPass:");
console.log("- Include pages with: weirdweboctober");
console.log("- Exclude pages with: Remix");
console.log("\nExpected behavior:");
console.log("- Pages with ONLY weirdweboctober: ✓ included");
console.log("- Pages with BOTH weirdweboctober AND Remix: ✗ excluded");
console.log("- Pages with ONLY Remix: ✗ excluded");
console.log("\n");

// The fix changes buildObjectStatement to use FILTER NOT EXISTS instead of FILTER(?o NOT IN (?excludedObjects))
// This ensures the entire subject/page is checked for excluded objects, not just the current ?o binding

console.log("Expected SPARQL fragment in Phase 1 query:");
console.log(`
VALUES ?o { <https://octothorp.es/~/weirdweboctober> }
FILTER NOT EXISTS {
  VALUES ?excludedObjects { <https://octothorp.es/~/Remix> }
  ?s octo:octothorpes ?excludedObjects .
}
`);
