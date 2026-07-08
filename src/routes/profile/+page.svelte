<script type="text/javascript">
  export let data
  $: profile = data.profile
  $: vocab = profile.vocabulary || {}
</script>

<svelte:head>
  <title>{profile.name} — Client Profile</title>
</svelte:head>

<div class="container">

<h1>{profile.name}</h1>
{#if profile.description}
  <p>{profile.description}</p>
{/if}
<p>
  This is the <a href="/profile.json">machine-readable profile</a> for this
  Octothorpes Protocol client, rendered as a page.
</p>

<h2>Relay</h2>
<ul>
  <li><strong>Relay:</strong> {profile.relay}</li>
  <li><strong>Indexing mode:</strong> {profile.indexingMode}</li>
  <li><strong>Indexing frequency:</strong> {profile.indexingFrequency}</li>
  <li><strong>Registration policy:</strong> {profile.registrationPolicy}</li>
  <li><strong>Commercial activity:</strong> {profile.commercialActivity ? 'yes' : 'no'}</li>
</ul>

<h2>Harmonizers &amp; Publishers</h2>
<ul>
  <li><strong>Default harmonizer:</strong> {profile.defaultHarmonizer}</li>
  <li><strong>Named harmonizers:</strong> {(profile.namedHarmonizers || []).join(', ') || 'none'}</li>
  <li><strong>Default publisher:</strong> {profile.defaultPublisher}</li>
  <li><strong>Named publishers:</strong> {(profile.namedPublishers || []).join(', ') || 'none'}</li>
</ul>

{#if profile.vocabularyDocument}
  <h2>Vocabulary document</h2>
  <p><a href={profile.vocabularyDocument}>{profile.vocabularyDocument}</a></p>
{/if}

{#if vocab.relationshipSubtypes?.length}
  <h2>Relationship subtypes</h2>
  <p>Declared subtypes are exposed as first-class API paths (<code>/get/&lt;path&gt;/&lt;by&gt;</code>).</p>
  <ul>
    {#each vocab.relationshipSubtypes as st}
      <li>
        <strong>{st.type}</strong> — {st.label}
        (<a href="/get/{st.path}/thorped">/get/{st.path}/…</a>)
      </li>
    {/each}
  </ul>
{/if}

{#if vocab.documentRecord?.length}
  <h2>Document record</h2>
  <p>Declared non-canonical predicates projected onto the blobject read surface.</p>
  <ul>
    {#each vocab.documentRecord as dr}
      <li><strong>{dr.predicate}</strong> — <code>{dr.namespace}</code> ({dr.range})</li>
    {/each}
  </ul>
{/if}

{#if profile.contentLabels?.length}
  <h2>Content labels</h2>
  <ul>
    {#each profile.contentLabels as label}
      <li>{label}</li>
    {/each}
  </ul>
{/if}

{#if profile.externalAccounts?.length}
  <h2>External accounts</h2>
  <ul>
    {#each profile.externalAccounts as account}
      <li><strong>{account.provider}:</strong> {account.handle}</li>
    {/each}
  </ul>
{/if}

{#if profile.contacts?.length}
  <h2>Contacts</h2>
  <ul>
    {#each profile.contacts as contact}
      <li>{contact.name}{#if contact.email} — <a href="mailto:{contact.email}">{contact.email}</a>{/if}</li>
    {/each}
  </ul>
{/if}

{#if profile.terms}
  <p><a href={profile.terms}>Terms</a></p>
{/if}

</div>
