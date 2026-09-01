<script type="text/javascript">
  export let data
  $: profile = data.profile
  $: identity = profile.identity || {}
  $: policies = profile.policies || {}
  $: access = policies.access || {}
  $: indexing = policies.indexing || {}
  $: api = profile.api || {}
  $: vocab = profile.vocabulary || {}
</script>

<svelte:head>
  <title>{identity.name || 'Client'} — Client Profile</title>
</svelte:head>

<div class="container">

{#if identity.name}
  <h1>{identity.name}</h1>
{/if}
{#if identity.description}
  <p>{identity.description}</p>
{/if}
<p>
  This is the <a href="/profile.json">machine-readable profile</a> for this
  Octothorpes Protocol client, rendered as a page.
</p>

{#if identity.instance || identity.contact || identity.feeds || identity.images}
  <h2>Identity</h2>
  <ul>
    {#if identity.instance}<li><strong>Instance:</strong> {identity.instance}</li>{/if}
    {#if identity.contact?.email}<li><strong>Contact:</strong> <a href="mailto:{identity.contact.email}">{identity.contact.email}</a></li>{/if}
    {#if identity.contact?.bluesky}<li><strong>Bluesky:</strong> {identity.contact.bluesky}</li>{/if}
    {#if identity.terms}<li><strong>Terms:</strong> <a href={identity.terms}>{identity.terms}</a></li>{/if}
  </ul>
  {#if identity.images && Object.keys(identity.images).length}
    <h3>Images</h3>
    <ul>
      {#each Object.entries(identity.images) as [slot, url]}
        <li><strong>{slot}:</strong> <a href={url}>{url}</a></li>
      {/each}
    </ul>
  {/if}
  {#if identity.feeds && Object.keys(identity.feeds).length}
    <h3>Feeds</h3>
    <ul>
      {#each Object.entries(identity.feeds) as [slot, value]}
        <li><strong>{slot}:</strong> {Array.isArray(value) ? value.join(', ') : value}</li>
      {/each}
    </ul>
  {/if}
{/if}

<h2>Policies</h2>
<p>Two separate policy axes: what triggers indexing, and what an index request
  must pass to be accepted.</p>
<ul>
  {#if policies.commercial !== undefined}<li><strong>Commercial activity:</strong> {policies.commercial ? 'yes' : 'no'}</li>{/if}
  {#if indexing.mode}<li><strong>Indexing is triggered by:</strong> {indexing.mode}</li>{/if}
  {#if indexing.frequency}<li><strong>Indexing frequency:</strong> {indexing.frequency}</li>{/if}
  {#if access.registration}<li><strong>Index requests must pass:</strong> {access.registration}</li>{/if}
  {#if access.badge}<li><strong>Badge:</strong> <a href={access.badge}>{access.badge}</a></li>{/if}
</ul>

{#if access.blocks?.domains?.length || access.whitelist?.domains?.length}
  <h3>Domain gates</h3>
  <ul>
    {#if access.blocks?.domains?.length}
      <li><strong>Blocked domains:</strong> {access.blocks.domains.join(', ')}</li>
    {/if}
    {#if access.whitelist?.domains?.length}
      <li><strong>Whitelisted domains:</strong> {access.whitelist.domains.join(', ')}</li>
    {/if}
  </ul>
{/if}

{#if access.blocks?.terms?.length}
  <h3>Blocked terms</h3>
  <p>
    Term blocks are a separate mechanism from the gates above: they apply in
    every indexing mode and are enforced when statements are written, not at
    the index-request gate.
  </p>
  <ul>
    {#each access.blocks.terms as term}
      <li>{term}</li>
    {/each}
  </ul>
{/if}

{#if api.linkTypes?.length || api.documentRecord?.length || api.publishers?.available?.length || api.handlers || api.harmonizers?.available?.length}
  <h2>API</h2>
  {#if api.linkTypes?.length}
    <h3>Link types</h3>
    <ul>
      {#each api.linkTypes as lt}
        <li>{lt}</li>
      {/each}
    </ul>
  {/if}
  {#if api.documentRecord?.length}
    <h3>Document record</h3>
    <p>Declared non-canonical predicates projected onto the blobject read surface.</p>
    <ul>
      {#each api.documentRecord as dr}
        <li><strong>{dr.predicate}</strong> — <code>{dr.namespace}</code> ({dr.range})</li>
      {/each}
    </ul>
  {/if}
  {#if api.publishers?.available?.length}
    <h3>Publishers</h3>
    <ul>
      {#each api.publishers.available as name}
        <li>{name}</li>
      {/each}
    </ul>
  {/if}
  {#if api.handlers?.default || api.handlers?.available?.length}
    <h3>Handlers</h3>
    <ul>
      {#if api.handlers.default}<li><strong>Default:</strong> {api.handlers.default}</li>{/if}
      {#if api.handlers.available?.length}<li><strong>Available:</strong> {api.handlers.available.join(', ')}</li>{/if}
    </ul>
  {/if}
  {#if api.harmonizers?.available?.length}
    <h3>Harmonizers</h3>
    <ul>
      <li><strong>Available:</strong> {api.harmonizers.available.join(', ')}</li>
    </ul>
  {/if}
{/if}

{#if vocab.octo || vocab.namespaces?.length}
  <h2>Vocabulary</h2>
  {#if vocab.octo}
    <p><strong>Octo term prefix:</strong> <code>{vocab.octo}</code></p>
  {/if}
  {#if vocab.namespaces?.length}
    <h3>Namespaces</h3>
    <ul>
      {#each vocab.namespaces as ns}
        <li>
          <strong>{ns.prefix}:</strong> <code>{ns.iri}</code>
          <em>({ns.source})</em>
        </li>
      {/each}
    </ul>
  {/if}
{/if}

</div>
