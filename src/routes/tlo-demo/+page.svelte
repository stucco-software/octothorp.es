<script>
  // STAGING-ONLY demo (#318). Server gate lives in +page.server.js.
  export let data
  export let form

  let uri = form?.uri ?? ''
  let tag = 'tlo'
  $: clientError = uri && !uri.startsWith('https://tinylittleoffice.com/')
    ? 'Link must start with https://tinylittleoffice.com/'
    : ''
</script>

<svelte:head>
  <title>Index a Tiny Little Office page (demo)</title>
  <script type="module" src="/components/octo-thorpe.js"></script>
</svelte:head>

<h1>Index a Tiny Little Office page</h1>
<p>Staging demo. Paste a <a href="https://tinylittleoffice.com">Tiny Little Office</a> link.
  The document lives in the link itself, so the relay decodes it instead of fetching it.
  Hashtags like <code>#some-tag</code> in the text become octothorpes.</p>

<form method="POST">
  <input name="uri" type="url" required size="60" bind:value={uri}
    pattern="https://tinylittleoffice\.com/.*"
    placeholder="https://tinylittleoffice.com/write/#doc=..." />
  <button type="submit" disabled={!!clientError}>Index this page</button>
</form>
{#if clientError}<p class="error">{clientError}</p>{/if}
{#if form?.error}<p class="error">{form.error}</p>{/if}
{#if form?.success}
  <p>Indexed{form.title ? ` "${form.title}"` : ''}.
    {#if form.tags?.length}Tags: {form.tags.map((t) => `#${t}`).join(' ')}{/if}</p>
{/if}

<h2>Recent TLO pages</h2>
<octo-thorpe s={data.origin} match="origin" render="list" limit="20" nopreload autoload></octo-thorpe>

<h2>TLO pages by hashtag</h2>
<label>Tag: <input bind:value={tag} /></label>
{#key tag}
  <octo-thorpe o={tag} s={data.origin} match="origin" render="list" limit="20" nopreload autoload></octo-thorpe>
{/key}
