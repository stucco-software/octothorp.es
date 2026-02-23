import { createClient } from '../packages/core/index.js'

const client = createClient({
  instance: process.env.instance,
  sparql: {
    endpoint: process.env.sparql_endpoint,
    user: process.env.sparql_user,
    password: process.env.sparql_password,
  },
})

console.log('=== @octothorpes/core alpha test ===\n')

// Test 1: Fast API - list all terms
console.log('1. fast.terms()')
try {
  const terms = await client.api.fast.terms()
  console.log(`   Found ${terms.length} term bindings`)
  if (terms.length > 0) {
    console.log(`   First: ${terms[0].t.value}`)
  }
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

// Test 2: Fast API - single term
console.log('\n2. fast.term("demo")')
try {
  const result = await client.api.fast.term('demo')
  console.log(`   Pages: ${result.pages.length}, Bookmarks: ${result.bookmarks.length}`)
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

// Test 3: Fast API - domains
console.log('\n3. fast.domains()')
try {
  const domains = await client.api.fast.domains()
  console.log(`   Found ${domains.length} verified domains`)
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

// Test 4: General-purpose API - get everything thorped
console.log('\n4. api.get("everything", "thorped", { o: "demo", limit: "5" })')
try {
  const result = await client.api.get('everything', 'thorped', { o: 'demo', limit: '5' })
  console.log(`   Results: ${result.results.length}`)
  if (result.results.length > 0) {
    console.log(`   First: ${result.results[0]['@id']}`)
  }
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

// Test 5: General-purpose API - debug mode
console.log('\n5. api.get("pages", "thorped", { o: "demo", as: "debug" })')
try {
  const result = await client.api.get('pages', 'thorped', { o: 'demo', as: 'debug' })
  console.log(`   MultiPass resultMode: ${result.multiPass.meta.resultMode}`)
  console.log(`   Query length: ${result.query.length} chars`)
  console.log(`   Results: ${result.actualResults.length}`)
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

// Test 6: Harmonizer
console.log('\n6. harmonizer.getHarmonizer("default")')
try {
  const h = await client.harmonizer.getHarmonizer('default')
  console.log(`   Title: ${h.title}`)
  console.log(`   Schema keys: ${Object.keys(h.schema).join(', ')}`)
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

console.log('\n=== Done ===')
