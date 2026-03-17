<!--
  OCTO-BADGE WEB COMPONENT
  
  Renders a badge image that triggers indexing on the OP server.
  Automatically passes the current page URL via the ?uri= parameter,
  avoiding cross-origin Referer stripping issues.
  
  USAGE:
    <script type="module" src="https://octothorp.es/components/octo-badge.js"></script>
    <octo-badge></octo-badge>
  
  ATTRIBUTES:
    server  - OP server URL (default: "https://octothorp.es")
    uri     - Explicit page URL to index (default: current page URL)
    as      - Harmonizer ID or URL (default: "default")
-->

<svelte:options customElement="octo-badge" />

<script>
  import { onMount } from 'svelte';

  export let server = 'https://octothorp.es';
  export let uri = '';
  export let as = '';

  let badgeUrl = '';

  onMount(() => {
    const pageUri = uri || window.location.href;
    const params = new URLSearchParams();
    params.set('uri', pageUri);
    if (as) params.set('as', as);
    badgeUrl = `${server.replace(/\/+$/, '')}/badge?${params.toString()}`;
  });
</script>

{#if badgeUrl}
  <a href={server} target="_blank" rel="noopener noreferrer">
    <img src={badgeUrl} alt="Octothorpes Protocol" width="88" height="31" />
  </a>
{/if}

<style>
  a {
    display: inline-block;
    line-height: 0;
  }
  img {
    image-rendering: pixelated;
  }
</style>
