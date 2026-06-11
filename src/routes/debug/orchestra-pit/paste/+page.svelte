<script>
  import { enhance } from '$app/forms'
  export let data
  export let form

  // Preserve selections / pasted text across submits.
  $: text = form?.text ?? ''
  $: selectedHarmonizer = form?.harmonizerId ?? 'rss'
  $: selectedMode = form?.explicitMode ?? ''
  let running = false

  // Client-side accumulation: each calendar submission appends its events to a
  // running, provenance-tagged feed. Nothing is persisted server-side.
  let feed = []
  let calendars = []      // [{ feedUrl, calendarName, count }]
  let calRunning = false

  const addToFeed = (payload) => {
    if (!payload?.events) return
    feed = [...feed, ...payload.events]
    calendars = [...calendars, {
      feedUrl: payload.feedUrl,
      calendarName: payload.calendarName ?? '(unnamed)',
      count: payload.eventCount ?? payload.events.length,
    }]
  }

  const clearFeed = () => { feed = []; calendars = [] }

  const sampleRss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <link>https://example.com/feed</link>
    <description>An example feed</description>
    <item>
      <title>Post 1</title>
      <link>https://example.com/p1</link>
      <category>news</category>
    </item>
  </channel>
</rss>`
</script>

<svelte:head><title>Orchestra Pit — Paste</title></svelte:head>

<main>
  <h1>Orchestra Pit — Paste</h1>
  <p>
    Paste raw content and run it through a handler/harmonizer pair. Produces a
    blobject only — nothing is written to the triplestore. For RSS, pick the
    <code>rss</code> harmonizer and leave the handler on <em>auto</em> (it
    resolves to <code>xml</code>). Note the <code>rss</code> harmonizer reads
    <code>rss.channel.*</code>, so paste a full <code>&lt;rss&gt;&lt;channel&gt;</code>
    envelope, not a bare <code>&lt;item&gt;</code>.
  </p>

  <form method="POST" action="?/paste" use:enhance={() => {
    running = true
    return async ({ update }) => { await update({ reset: false }); running = false }
  }}>
    <label for="text">Content</label>
    <textarea id="text" name="text" rows="14" placeholder="Paste RSS / HTML / JSON here…" bind:value={text}></textarea>

    <div class="row">
      <label>
        Harmonizer
        <select name="harmonizer" bind:value={selectedHarmonizer}>
          {#each data.harmonizers as h}
            <option value={h}>{h}</option>
          {/each}
        </select>
      </label>

      <label>
        Handler
        <select name="mode" bind:value={selectedMode}>
          <option value="">auto (from harmonizer)</option>
          {#each data.handlers as m}
            <option value={m}>{m}</option>
          {/each}
        </select>
      </label>

      <button type="submit" disabled={running}>{running ? 'Running…' : 'Run'}</button>
      <button type="button" on:click={() => (text = sampleRss)}>Load RSS sample</button>
    </div>
  </form>

  <hr />

  <h2>Unified calendar feed</h2>
  <p>
    Paste a public Google Calendar URL (the <code>?cid=…</code> link from
    "Settings → Integrate calendar → Public address") or a direct <code>.ics</code>
    URL. Each submission resolves the feed, harmonizes every event, and
    <strong>appends</strong> to the combined feed below — blend several public
    calendars into one JSON document. Nothing is written to the triplestore.
  </p>

  <form method="POST" action="?/calendar" use:enhance={() => {
    calRunning = true
    return async ({ result, update }) => {
      if (result.type === 'success') addToFeed(result.data)
      await update({ reset: false })
      calRunning = false
    }
  }}>
    <label for="calendarUrl">Calendar URL</label>
    <input id="calendarUrl" name="calendarUrl" type="text"
           placeholder="https://calendar.google.com/calendar/u/0?cid=…" />
    <div class="row">
      <button type="submit" disabled={calRunning}>{calRunning ? 'Fetching…' : 'Add calendar'}</button>
      <button type="button" on:click={clearFeed} disabled={!feed.length}>Clear feed</button>
    </div>
  </form>

  {#if form?.calendarError}
    <section class="error"><h3>Error</h3><pre>{form.calendarError}</pre></section>
  {/if}

  {#if calendars.length}
    <section>
      <h3>{feed.length} events from {calendars.length} calendar{calendars.length === 1 ? '' : 's'}</h3>
      <ul>
        {#each calendars as c}
          <li><strong>{c.calendarName}</strong> — {c.count} events <code>{c.feedUrl}</code></li>
        {/each}
      </ul>
      <pre>{JSON.stringify(feed, null, 2)}</pre>
    </section>
  {/if}

  {#if form?.error}
    <section class="error">
      <h2>Error</h2>
      <pre>{form.error}</pre>
    </section>
  {/if}

  {#if form?.result}
    <section>
      <h2>Blobject</h2>
      <p class="meta">
        harmonizer <code>{form.harmonizerId}</code> · handler <code>{form.mode}</code>
      </p>
      <pre>{JSON.stringify(form.result, null, 2)}</pre>

      <details>
        <summary>Resolved harmonizer schema</summary>
        <pre>{JSON.stringify(form.harmonizerUsed, null, 2)}</pre>
      </details>
    </section>
  {/if}
</main>

<style>
  main { max-width: 70ch; margin: 2rem auto; padding: 0 1rem; font-family: system-ui, sans-serif; }
  textarea { width: 100%; font-family: ui-monospace, monospace; font-size: 0.85rem; }
  .row { display: flex; gap: 1rem; align-items: flex-end; flex-wrap: wrap; margin: 0.75rem 0; }
  label { display: block; font-size: 0.85rem; }
  select { display: block; margin-top: 0.25rem; }
  button { padding: 0.4rem 0.9rem; }
  pre { background: #f4f4f4; padding: 0.75rem; overflow: auto; font-size: 0.8rem; }
  .meta code { background: #eee; padding: 0 0.25rem; }
  .error pre { background: #fdecea; }
  input[type="text"] { width: 100%; font-family: ui-monospace, monospace; font-size: 0.85rem; padding: 0.3rem; box-sizing: border-box; }
  hr { margin: 2rem 0; }
</style>
