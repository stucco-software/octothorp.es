<script type="text/javascript">
  import {arrayify} from "$lib/arrayify"
  export let data
</script>

<main class="container">
  <h1>#{data.term}</h1>
 <div id="follow-links">
     <p class="narrow gray" id="follow-links"> <a href="/get/pages/thorped/rss?o={data.term}" id="rss-link"><img src="/Rss_Shiny_Icon.svg" alt="RSS feed link" width="20" style="display: inline;"> RSS</a> • <a href="/get/pages/thorped?o={data.term}" id="json-link">JSON</a>
     </p>
 </div>
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



</main>

<style type="text/css">
    h1 {
        margin-bottom: .2rem;
    }
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
  #follow-links {
      width: 100%;
      display: inline-block;
      font-family: monospace;
  }
    #follow-links a {
        text-decoration: none;
    }

</style>
