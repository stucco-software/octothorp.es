<script>
  import { enhance } from '$app/forms'
  export let form

  $: path = form?.path ?? 'everything/thorped'
  $: query = form?.query ?? 'o=demo'
  $: results = form?.results ?? []
  let running = false

  // Per-item view toggle: 'reader' (rendered HTML) | 'text' (plain text).
  let views = {}
  const setView = (i, v) => { views = { ...views, [i]: v } }
  const viewOf = (i) => views[i] ?? 'reader'

  const isError = (r) => r && typeof r.error === 'string'
  const readingTime = (len) => len ? `${Math.max(1, Math.round(len / 1000))} min read` : null
</script>

<svelte:head><title>Readable — debug</title></svelte:head>

<main>
  <h1>Readable</h1>
  <p>
    Run a <code>/get</code> query through the <code>readable</code> publisher and
    read the extracted content. Each result is fetched and run through
    Readability; expand a row to read it. Read-only — nothing is indexed.
  </p>

  <form method="POST" action="?/fetchReadable" use:enhance={() => {
    running = true
    return async ({ update }) => { await update({ reset: false }); running = false }
  }}>
    <div class="row">
      <label>
        Query path
        <input name="path" type="text" bind:value={path} placeholder="everything/thorped" />
      </label>
      <label>
        Query string
        <input name="query" type="text" bind:value={query} placeholder="o=demo" />
      </label>
      <button type="submit" disabled={running}>{running ? 'Fetching…' : 'Fetch'}</button>
    </div>
    <p class="hint">
      Requests <code>/get/{path}/readable{query ? `?${query}` : ''}</code>
    </p>
  </form>

  {#if form?.error}
    <section class="error"><h2>Error</h2><pre>{form.error}</pre></section>
  {/if}

  {#if form?.endpoint}
    <p class="meta">
      {results.length} result{results.length === 1 ? '' : 's'} from
      <code>{form.endpoint}</code>
    </p>
  {/if}

  {#each results as r, i}
    <details class="item" class:item--error={isError(r)}>
      <summary>
        <span class="title">{r.title || r.url}</span>
        {#if isError(r)}
          <span class="badge badge--error">failed</span>
        {:else if readingTime(r.length)}
          <span class="badge">{readingTime(r.length)}</span>
        {/if}
      </summary>

      {#if isError(r)}
        <p class="errline">{r.error}</p>
        <p class="src"><a href={r.url} target="_blank" rel="noreferrer">{r.url}</a></p>
      {:else}
        <dl class="metadata">
          {#if r.byline}<dt>By</dt><dd>{r.byline}</dd>{/if}
          {#if r.siteName}<dt>Site</dt><dd>{r.siteName}</dd>{/if}
          <dt>URL</dt><dd><a href={r.url} target="_blank" rel="noreferrer">{r.url}</a></dd>
          {#if r.excerpt}<dt>Excerpt</dt><dd>{r.excerpt}</dd>{/if}
        </dl>

        <div class="tabs">
          <button type="button" class:active={viewOf(i) === 'reader'} on:click={() => setView(i, 'reader')}>Reader</button>
          <button type="button" class:active={viewOf(i) === 'text'} on:click={() => setView(i, 'text')}>Plain text</button>
        </div>

        {#if viewOf(i) === 'reader'}
          <!-- Debug tool, local use: render Readability's cleaned HTML directly. -->
          <article class="content">{@html r.content}</article>
        {:else}
          <pre class="content text">{r.textContent}</pre>
        {/if}
      {/if}
    </details>
  {/each}
</main>

<style>
  main { max-width: 75ch; margin: 2rem auto; padding: 0 1rem; font-family: system-ui, sans-serif; line-height: 1.5; }
  .row { display: flex; gap: 1rem; align-items: flex-end; flex-wrap: wrap; margin: 0.75rem 0; }
  label { display: block; font-size: 0.85rem; flex: 1 1 12rem; }
  input[type="text"] { width: 100%; font-family: ui-monospace, monospace; font-size: 0.85rem; padding: 0.35rem; box-sizing: border-box; margin-top: 0.25rem; }
  button { padding: 0.4rem 0.9rem; cursor: pointer; }
  .hint, .meta { font-size: 0.8rem; color: #555; }
  code { background: #eee; padding: 0 0.25rem; }

  .item { border: 1px solid #ddd; border-radius: 6px; margin: 0.6rem 0; padding: 0.4rem 0.8rem; }
  .item--error { border-color: #f3b8b2; background: #fdf3f2; }
  summary { cursor: pointer; display: flex; align-items: center; gap: 0.6rem; }
  summary .title { font-weight: 600; }
  .badge { font-size: 0.7rem; background: #eee; border-radius: 999px; padding: 0.1rem 0.6rem; color: #444; }
  .badge--error { background: #f8d7da; color: #842029; }

  .metadata { display: grid; grid-template-columns: max-content 1fr; gap: 0.2rem 0.8rem; font-size: 0.85rem; margin: 0.6rem 0; }
  .metadata dt { color: #666; }
  .metadata dd { margin: 0; }

  .tabs { display: flex; gap: 0.4rem; margin: 0.6rem 0 0.4rem; }
  .tabs button { font-size: 0.78rem; padding: 0.25rem 0.7rem; background: #f4f4f4; border: 1px solid #ccc; border-radius: 4px; }
  .tabs button.active { background: #222; color: #fff; border-color: #222; }

  .content { border-top: 1px solid #eee; padding-top: 0.6rem; }
  .content :global(img) { max-width: 100%; height: auto; }
  pre.text { white-space: pre-wrap; word-break: break-word; background: #f7f7f7; padding: 0.75rem; font-size: 0.82rem; }
  .errline { color: #842029; font-family: ui-monospace, monospace; font-size: 0.85rem; }
  .src a { font-size: 0.82rem; }
  .error pre { background: #fdecea; padding: 0.75rem; }
</style>
