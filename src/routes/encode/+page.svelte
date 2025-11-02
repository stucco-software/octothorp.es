<script>
  import MultiPassEncoder from '$lib/components/MultiPassEncoder.svelte';
  
  let encodeResult = null;

  function handleEncode(event) {
    encodeResult = event;
  }
</script>

<svelte:head>
  <title>Encode MultiPass GIF - Octothorpes Protocol</title>
  <meta name="description" content="Embed MultiPass queries into GIF images for easy sharing">
</svelte:head>

<article>
  <h1>Encode MultiPass GIF</h1>
  
  <p class="intro">
    Create shareable MultiPass GIFs by embedding your query JSON into an image.
    This happens entirely in your browser - no data is uploaded to our servers.
  </p>

  <MultiPassEncoder onEncode={handleEncode} />

  {#if encodeResult?.success}
    <div class="success-message">
      <strong>Success!</strong> Your MultiPass GIF has been downloaded.
      You can now share it or upload it to the <a href="/query">query page</a> to run the query.
    </div>
  {/if}

  <section class="info">
    <h2>How it works</h2>
    <ol>
      <li>Upload a valid MultiPass JSON file (exported from a query)</li>
      <li>Upload any GIF image you'd like to use</li>
      <li>Click "Encode & Download" to get your MultiPass GIF</li>
      <li>Share the GIF or use it on the <a href="/query">query page</a></li>
    </ol>

    <details>
      <summary>Privacy & Security</summary>
      <p>
        All encoding happens <strong>client-side in your browser</strong>. Your MultiPass JSON 
        and GIF image are never sent to our servers. The files are processed entirely in 
        browser memory and discarded when you close the page.
      </p>
    </details>

    <details>
      <summary>What is a MultiPass?</summary>
      <p>
        A MultiPass is a JSON object that describes a query for the Octothorpes Protocol.
        It contains fields like <code>uris</code>, <code>tags</code>, <code>domains</code>,
        and <code>what</code> to specify what data you want to retrieve.
      </p>
      <p>
        You can create MultiPass queries through the <a href="/">homepage</a> or 
        the <a href="/api">API</a>.
      </p>
    </details>
  </section>
</article>

<style>
  article {
    max-width: 900px;
    margin: 0 auto;
    padding: 1rem;
  }

  h1 {
    font-family: var(--serif-stack);
    font-size: var(--txt-1);
    margin-block-end: 0.5rem;
  }

  h2 {
    font-family: var(--serif-stack);
    font-size: var(--txt-0);
    margin-block-start: 1.5rem;
    margin-block-end: 0.5rem;
  }

  .intro {
    font-size: var(--txt-0);
    margin-block-end: 1.5rem;
    line-height: 1.5;
  }

  .success-message {
    background-color: lightgreen;
    border: 2px solid green;
    padding: 0.75rem;
    margin-block-start: 1rem;
    font-size: var(--txt--1);
  }

  .success-message strong {
    font-weight: bold;
  }

  .success-message a {
    color: darkgreen;
    text-decoration: underline;
  }

  .info {
    margin-block-start: 2rem;
    padding-block-start: 1rem;
    border-top: 1px solid var(--txt-color);
  }

  ol {
    padding-inline-start: 1.5rem;
    line-height: 1.6;
  }

  ol li {
    margin-block-end: 0.5rem;
  }

  details {
    margin-block-start: 1rem;
    border: 1px solid var(--txt-color);
    padding: 0.5rem;
    background-color: var(--bg-color);
  }

  details summary {
    cursor: pointer;
    font-weight: bold;
    font-family: var(--sans-stack);
    padding: 0.25rem;
  }

  details summary:hover {
    background-color: lightgoldenrodyellow;
  }

  details p {
    margin-block-start: 0.5rem;
    margin-block-end: 0.5rem;
    line-height: 1.5;
  }

  details code {
    font-family: var(--mono-stack);
    background-color: lightgoldenrodyellow;
    padding: 0.125rem 0.25rem;
    border: 1px solid var(--txt-color);
  }

  details a {
    color: blue;
    text-decoration: underline;
  }

  details a:hover {
    background-color: yellow;
  }
</style>
