<script>
  import ApiQuery from '$lib/components/ApiQuery.svelte'
  import { browser } from '$app/environment'

  let testResult = null
  let testError = null

  function handleSuccess(event) {
    testResult = event.detail
    console.log('Test successful:', event.detail)
  }

  function handleError(event) {
    testError = event.detail
    console.error('Test failed:', event.detail)
  }
</script>

<svelte:head>
  <title>ApiQuery Test</title>
</svelte:head>

<div class="test-container">
  <h1>ApiQuery Component Test</h1>
  
  <p>This is a simple test to verify the ApiQuery component works correctly.</p>

  {#if browser}
    <div class="test-section">
      <h2>Basic Test</h2>
      <ApiQuery 
        multiPass={null}
        queryType="everything"
        queryMethod="posted"
        outputFormat="debug"
        autoExecute={true}
        showDebug={true}
        on:success={handleSuccess}
        on:error={handleError}
      />
    </div>

    <div class="test-section">
      <h2>Test Results</h2>
      {#if testResult}
        <div class="success">
          <h3>✅ Success!</h3>
          <p>Query executed successfully</p>
          <details>
            <summary>Result Details</summary>
            <pre>{JSON.stringify(testResult, null, 2)}</pre>
          </details>
        </div>
      {/if}

      {#if testError}
        <div class="error">
          <h3>❌ Error</h3>
          <p>{testError.error}</p>
          <details>
            <summary>Error Details</summary>
            <pre>{JSON.stringify(testError, null, 2)}</pre>
          </details>
        </div>
      {/if}
    </div>
  {:else}
    <p>Loading...</p>
  {/if}
</div>

<style>
  .test-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .test-section {
    margin: 2rem 0;
    padding: 1rem;
    border: 1px solid #e1e5e9;
    border-radius: 8px;
  }

  .success {
    background: #d4edda;
    border: 1px solid #c3e6cb;
    border-radius: 4px;
    padding: 1rem;
    color: #155724;
  }

  .error {
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    border-radius: 4px;
    padding: 1rem;
    color: #721c24;
  }

  pre {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    padding: 0.5rem;
    overflow-x: auto;
    font-size: 0.875rem;
    margin: 0.5rem 0;
  }
</style> 