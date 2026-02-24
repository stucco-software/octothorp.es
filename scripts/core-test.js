import { createClient } from '../packages/core/index.js'

const client = createClient({
  instance: process.env.instance,
  sparql: process.env,
})

console.log('=== @octothorpes/core alpha test ===\n')

// Test 1: getfast.terms()
console.log('1. getfast.terms()')
try {
  const terms = await client.getfast.terms()
  console.log(`   Found ${terms.length} term bindings`)
  if (terms.length > 0) {
    console.log(`   First: ${terms[0].t.value}`)
  }
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

// Test 2: getfast.term()
console.log('\n2. getfast.term("demo")')
try {
  const result = await client.getfast.term('demo')
  console.log(`   Pages: ${result.pages.length}, Bookmarks: ${result.bookmarks.length}`)
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

// Test 3: getfast.domains()
console.log('\n3. getfast.domains()')
try {
  const domains = await client.getfast.domains()
  console.log(`   Found ${domains.length} verified domains`)
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

// Test 4: get() with flat params
console.log('\n4. get({ what: "everything", by: "thorped", o: "demo", limit: "5" })')
try {
  const result = await client.get({ what: 'everything', by: 'thorped', o: 'demo', limit: '5' })
  console.log(`   Results: ${result.results.length}`)
  if (result.results.length > 0) {
    console.log(`   First: ${result.results[0]['@id']}`)
  }
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

// Test 5: get() debug mode
console.log('\n5. get({ what: "pages", by: "thorped", o: "demo", as: "debug" })')
try {
  const result = await client.get({ what: 'pages', by: 'thorped', o: 'demo', as: 'debug' })
  console.log(`   MultiPass resultMode: ${result.multiPass.meta.resultMode}`)
  console.log(`   Results: ${result.actualResults.length}`)
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

// Test 6: harmonizer.getHarmonizer()
console.log('\n6. harmonizer.getHarmonizer("default")')
try {
  const h = client.harmonizer.getHarmonizer('default')
  console.log(`   Title: ${h.title}`)
  console.log(`   Schema keys: ${Object.keys(h.schema).join(', ')}`)
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

// Test 7: harmonizer.list()
console.log('\n7. harmonizer.list()')
try {
  const all = client.harmonizer.list()
  console.log(`   Keys: ${Object.keys(all).join(', ')}`)
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

console.log('\n=== Done ===')
