<script type="text/javascript">
  import {arrayify} from "$lib/arrayify"
  export let data
</script>

<main class="container">
  <h1>#{data.term}</h1>

  <ul>
    {#each data.thorpes as thorpe}
      <li>
        <a
          rel="octothorpedBy"
          href="{thorpe.uri}">{thorpe.title ? thorpe.title : thorpe.uri}</a>
          {#if thorpe.title}
          <p class="gray">{thorpe.uri}</p>
        {/if}
        {#if thorpe.description}
          <p class="narrow">{thorpe.description}</p>
        {/if}

      </li>
    {/each}
  </ul>

  {#if data.bookmarks.length > 0}
    <h2>Bookmarked</h2>
  {/if}
  <ul class="narrow">
    {#each data.bookmarks as mark}
      <li>
        <a
          rel="octothorpedBy"
          href="{mark.uri}">{mark.title ? mark.title : mark.uri}
        </a>
        {#if mark.title}
          <p class="gray">{mark.uri}</p>
        {/if}
        {#if mark.description}
          <p class="narrow">{mark.description}</p>
        {/if}
        <p>
          {#each arrayify(mark.tag) as tag}
            <a href="{tag}">#{tag.split('/~/')[1]}</a>
          {/each}
        </p>

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
  ul.narrow {
    margin-top: var(--lead-1);
    list-style-type: none;
  }
  details {
    display: inline;
  }
  p.narrow {

    font-size: .7rem;
    width: 65%;
  }
  p.gray {
    color: var(--dark-gray);
    font-size: .8rem;
  }
</style>