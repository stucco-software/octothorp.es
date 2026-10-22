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
  <p class="lede">{identity.description}</p>
{/if}

<!-- #325: the server identity card. This is the part a stranger needs —
     who runs this relay, how to reach them, and whether they can index with
     it. Everything machine-facing moved into the Advanced section below. -->
<div class="identity-card">
  <dl>
    {#if identity.instance}
      <dt>Instance</dt>
      <dd><a href={identity.instance}>{identity.instance}</a></dd>
    {/if}
    {#if identity.contact?.email || identity.contact?.bluesky}
      <dt>Contact</dt>
      <dd>
        {#if identity.contact?.email}<a href="mailto:{identity.contact.email}">{identity.contact.email}</a>{/if}
        {#if identity.contact?.email && identity.contact?.bluesky} &middot; {/if}
        {#if identity.contact?.bluesky}{identity.contact.bluesky}{/if}
      </dd>
    {/if}
    {#if access.registration}
      <dt>Who can index here</dt>
      <dd>{access.registration}</dd>
    {/if}
    {#if indexing.mode}
      <dt>Indexing is triggered by</dt>
      <dd>{indexing.mode}</dd>
    {/if}
    {#if identity.terms}
      <dt>Term prefix</dt>
      <dd><a href={identity.terms}>{identity.terms}</a></dd>
    {/if}
    {#if identity.rules}
      <dt>Rules</dt>
      <dd><a href={identity.rules}>{identity.rules}</a></dd>
    {/if}
  </dl>
</div>

<p>
  Full detail is in the <a href="/profile.json">machine-readable profile</a>, or
  in the <a href="#advanced">Advanced</a> section below.
</p>

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

<h2 id="advanced">Advanced</h2>
<p>
  The machine-facing surface of this relay: its policies in full, the API it
  serves, the vocabulary it uses, and how to keep a page out of it.
</p>

<h3>Policies</h3>
<p>Two separate policy axes: what triggers indexing, and what an index request
  must pass to be accepted.</p>
<ul>
  {#if policies.commercial !== undefined}<li><strong>Commercial activity:</strong> {policies.commercial ? 'yes' : 'no'}</li>{/if}
  {#if indexing.mode}<li><strong>Indexing is triggered by:</strong> {indexing.mode}</li>{/if}
  {#if indexing.cooldown !== undefined}<li><strong>Re-index cooldown:</strong> {indexing.cooldown === 0 ? 'none' : `${indexing.cooldown}s`}</li>{/if}
  {#if access.registration}<li><strong>Index requests must pass:</strong> {access.registration}</li>{/if}
  {#if access.badge}<li><strong>Badge:</strong> <a href={access.badge}>{access.badge}</a></li>{/if}
</ul>

{#if access.blocks?.domains?.length || access.whitelist?.domains?.length}
  <h4>Domain gates</h4>
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
  <h4>Blocked terms</h4>
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

{#if api.routes || api.linkTypes?.length || api.documentRecord?.length || api.publishers?.available?.length || api.handlers || api.harmonizers?.available?.length}
  <h3>API</h3>
  {#if api.routes}
    <h4>Routes</h4>
    <p>
      Where this client serves each endpoint, and — for <code>/get</code> — every word
      and query param a request may use. This block is a projection: core supplies the
      query grammar, the adapter supplies the mount points, and the two are composed at
      init. It is never authored in a profile.
    </p>
    <ul>
      {#each Object.entries(api.routes) as [mount, route]}
        <li>
          <strong>{mount}</strong> &mdash; <code>{route.template}</code>
          {#if route.what || route.by || route.as || route.params}
            <ul>
              {#if route.what}<li><code>what</code>: {route.what.join(', ')}</li>{/if}
              {#if route.by}<li><code>by</code>: {route.by.join(', ')}</li>{/if}
              {#if route.as}<li><code>as</code>: {route.as.join(', ')}</li>{/if}
              {#if route.params}<li>params: {route.params.map((x) => '?' + x).join(', ')}</li>{/if}
              {#if route.match}<li><code>?match=</code>: {route.match.join(', ')}</li>{/if}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if api.linkTypes?.length}
    <h4>Link types</h4>
    <p>
      The <code>by</code> words this client answers to. Each is a bundle: a query word, the
      relationship subtype it filters on, and what may sit on the object side.
      Builtins ship with core; declared ones come from this client's profile and are
      written by a harmonizer that emits the same subtype.
    </p>
    <ul>
      {#each api.linkTypes as lt}
        <li>
          <code>/get/everything/{lt.by}</code>
          {#if lt.subtype}&mdash; <code>octo:{lt.subtype}</code>{/if}
          {#if lt.label} ({lt.label}){/if}
          &mdash; objects: <code>{lt.objects}</code>
          {#if lt.relationTerms}, supports <code>?rt=</code>{/if}
          <em>({lt.source})</em>
        </li>
      {/each}
    </ul>
  {/if}
  {#if api.documentRecord?.length}
    <h4>Document record</h4>
    <p>Declared non-canonical predicates projected onto the blobject read surface.</p>
    <ul>
      {#each api.documentRecord as dr}
        <li><strong>{dr.predicate}</strong> — <code>{dr.namespace}</code> ({dr.range})</li>
      {/each}
    </ul>
  {/if}
  {#if api.publishers?.available?.length}
    <h4>Publishers</h4>
    <ul>
      {#each api.publishers.available as pub}
        <li>{typeof pub === 'string' ? pub : pub.name}{typeof pub === 'string' || !pub.source ? '' : ` (${pub.source})`}</li>
      {/each}
    </ul>
  {/if}
  {#if api.handlers?.default || api.handlers?.available?.length}
    <h4>Handlers</h4>
    <ul>
      {#if api.handlers.default}<li><strong>Default:</strong> {api.handlers.default}</li>{/if}
      {#if api.handlers.available?.length}<li><strong>Available:</strong> {api.handlers.available.join(', ')}</li>{/if}
    </ul>
  {/if}
  {#if api.harmonizers?.available?.length}
    <h4>Harmonizers</h4>
    <ul>
      <li><strong>Available:</strong> {api.harmonizers.available.map((h) => (typeof h === 'string' ? h : h.source ? `${h.name} (${h.source})` : h.name)).join(', ')}</li>
    </ul>
  {/if}
{/if}

{#if vocab.octo || vocab.namespaces?.length}
  <h3>Vocabulary</h3>
  {#if vocab.octo}
    <p><strong>Octo term prefix:</strong> <code>{vocab.octo}</code></p>
  {/if}
  {#if vocab.namespaces?.length}
    <h4>Namespaces</h4>
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

{#if identity.instance}
  <h3>Blocking this relay</h3>
  <p>
    To keep a page out of this relay ({identity.instance}), put this in the
    <code>&lt;head&gt;</code> of the page:
  </p>
  <pre><code>&lt;meta name="octo-policy" content="no-index"&gt;</code></pre>
  <p>
    The explicit no-index overrides every automatic opt-in, including a page
    that contains Octothorpes markup and the relay's active indexing mode. The tag
    is not specific to this relay: any relay running the same indexer honors it.
    The indexer has no markup that names a single relay.
  </p>
  <h4>Other ways to block</h4>
  <ul>
    <li>
      <strong>Robots meta.</strong> <code>&lt;meta name="robots" content="noindex"&gt;</code>
      (also <code>nofollow</code> or <code>none</code>) is honored only when the
      relay finds the page itself, which happens in <code>active</code> indexing mode.
      It is ignored when the page's owner asks for indexing.
    </li>
    <li>
      <strong>User-Agent block.</strong> The relay fetches pages server-side.
      This is the exact User-Agent string it sends:
      <pre><code>{data.relayUserAgent}</code></pre>
      (Relays in <code>active</code> indexing mode carry an <code>(active;</code>
      marker before the instance URL; this string already reflects this relay's
      mode.) Refusing that User-Agent at your web server or CDN blocks this
      relay specifically, and a refused fetch fails the index request. For
      example, in nginx:
      <pre><code>if ($http_user_agent ~ "\+{identity.instance}") &#123; return 403; &#125;</code></pre>
      or as a Cloudflare WAF expression:
      <pre><code>(http.user_agent contains "+{identity.instance}")</code></pre>
      Matching on <code>+{identity.instance}</code> targets this relay alone;
      matching on <code>Octothorpes</code> targets all of them.
    </li>
    <li>
      <strong>robots.txt.</strong> The indexer does not read robots.txt, so it has no effect here.
    </li>
  </ul>
{/if}

</div>

<style>
  .lede { font-size: 1.1rem; }
  .identity-card {
    border: 1px solid currentColor;
    border-radius: 0.4rem;
    padding: 0.5rem 1rem;
    margin: 1rem 0;
  }
  .identity-card dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
    margin: 0.5rem 0;
  }
  .identity-card dt { font-weight: bold; }
  .identity-card dd { margin: 0; word-break: break-word; }
  @media (max-width: 30rem) {
    .identity-card dl { grid-template-columns: 1fr; }
    .identity-card dd { margin-bottom: 0.5rem; }
  }
</style>
