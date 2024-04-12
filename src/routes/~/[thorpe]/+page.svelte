<script type="text/javascript">
  export let data
</script>

<main class="container">
  <h1>#{data.thorpe}</h1>

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
    Follow <code>#{data.thorpe}</code> on <a href="/~/{data.thorpe}/rss">RSS</a> or use the
    <details>
      <summary>
        <code>JSON API</code>
      </summary>
      <pre><code>
curl -X GET \
  -H "Content-type: application/json" \
  -H "Accept: application/json" \
  "https://octothorp.es/~/{data.thorpe}"
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