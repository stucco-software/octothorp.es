<script type="text/javascript">
  export let data
</script>

<main class="container">
  <h1>#{data.term}</h1>

  <ul>
    {#each data.thorpes as thorpe}
      <li>
        <a
          rel="octothorpedBy"
          href="{thorpe}">{thorpe}</a>
      </li>
    {/each}
  </ul>


  <p>
    Follow <code>#{data.term}</code> on <a href="/~/{encodeURIComponent(data.term)}/rss">RSS</a> or use the
    <details>
      <summary>
        <code>JSON API</code>
      </summary>
      <pre><code>
curl -X GET \
  -H "Content-type: application/json" \
  -H "Accept: application/json" \
  "https://octothorp.es/~/{encodeURIComponent(data.term)}"
      </code></pre>
  </details>
  </p>

</main>

<style type="text/css">
  ul {
    margin-block: var(--lead-4);
  }
  details {
    display: inline;
  }
</style>