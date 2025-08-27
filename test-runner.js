#!/usr/bin/env node

/**
 * Test Runner for Octothorpe Protocol API Functions
 * 
 * This script runs all the test files and provides a summary of results.
 * It can be run independently or as part of the npm test script.
 */

import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const testFiles = [
  'src/lib/utils.test.js',
  'src/lib/harmonizeSource.test.js',
  'src/lib/sparql.test.js',
  'src/lib/converters.test.js',
  'src/routes/index/+server.test.js'
]

console.log('🧪 Running Octothorpe Protocol API Tests\n')

let totalTests = 0
let passedTests = 0
let failedTests = 0

for (const testFile of testFiles) {
  const testPath = join(__dirname, testFile)
  
  try {
    console.log(`📁 Running tests in: ${testFile}`)
    
    // Run the test file using vitest with proper configuration
    const result = execSync(`npx vitest run ${testPath} --reporter=verbose --run`, {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: 'pipe'
    })
    
    console.log('✅ All tests passed\n')
    
    // Count tests from output (this is a rough estimate)
    const testMatches = result.match(/(\d+) tests?/g)
    if (testMatches) {
      const testCount = parseInt(testMatches[0].split(' ')[0])
      totalTests += testCount
      passedTests += testCount
    }
    
  } catch (error) {
    console.log('❌ Some tests failed')
    console.log(error.stdout || error.message)
    console.log('')
    
    // Count failed tests
    const testMatches = error.stdout?.match(/(\d+) tests?/g)
    if (testMatches) {
      const testCount = parseInt(testMatches[0].split(' ')[0])
      totalTests += testCount
      failedTests += testCount
    }
  }
}

console.log('📊 Test Summary')
console.log('===============')
console.log(`Total Tests: ${totalTests}`)
console.log(`Passed: ${passedTests}`)
console.log(`Failed: ${failedTests}`)
console.log(`Success Rate: ${totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0}%`)

if (failedTests > 0) {
  console.log('\n❌ Some tests failed. Please review the output above.')
  process.exit(1)
} else {
  console.log('\n🎉 All tests passed!')
  process.exit(0)
} 