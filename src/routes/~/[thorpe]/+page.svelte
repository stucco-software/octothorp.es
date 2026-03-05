<script type="text/javascript">
  import {arrayify} from "octothorpes"
  export let data
</script>

<main class="container">
  <h1>#{data.term}</h1>
 <div id="follow-links">
     <p class="narrow gray" id="follow-links"> <a href="/~/{encodeURIComponent(data.term)}/rss"><img src="/Rss_Shiny_Icon.svg" alt="RSS feed link" width="20" style="display: inline;"> RSS</a> • <a href="/get/pages/thorped?o={data.term}" id="json-link">JSON</a>
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
        {#if thorpe.postDate || thorpe.date}
          <p class="date">
            {#if thorpe.postDate}
              {new Date(thorpe.postDate).toLocaleDateString()}
            {:else}
              Indexed {new Date(thorpe.date).toLocaleDateString()}
            {/if}
          </p>
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
        {#if mark.postDate || mark.date}
          <p class="date">
            {#if mark.postDate}
              {new Date(mark.postDate).toLocaleDateString()}
            {:else}
              Indexed {new Date(mark.date).toLocaleDateString()}
            {/if}
          </p>
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
    font-family: var(--sans-stack);
    font-size: .8rem;
    margin-top: 0px;
  }
  p.date {
    font-family: OCRA;
    font-size: var(--txt--2);
    color: #999;
    margin: 0;
    margin-block-start: -0.25rem;
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
