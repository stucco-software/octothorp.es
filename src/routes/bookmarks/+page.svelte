<script type="text/javascript">
  import { page } from '$app/stores'
  import {arrayify} from "$lib/arrayify"
  import LayoutSidebar from '$lib/components/LayoutSidebar.svelte'
  export let data
  console.log(data)
  let filter = null
  $: {
    console.log($page.url)
    filter = $page.url.searchParams.get('tag')
    console.log(filter)
  }
</script>

<LayoutSidebar>
  <div slot="main">

    <ul>
      {#each data.bookmarks as mark}

        {#if !filter || arrayify(mark.tag).map(tag => tag.split('/~/')[1]).includes(filter)}
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
        {/if}
      {/each}
    </ul>
  </div>

  <ul slot="aside">
    <li>
      <a href="/bookmarks">all</a>
    </li>
    {#each data.bookmarks as mark}
      {#each arrayify(mark.tag) as tag}
        <li>
          <a href="?tag={tag.split('/~/')[1]}">#{tag.split('/~/')[1]}</a>
        </li>
      {/each}
    {/each}
  </ul>
</LayoutSidebar>

<style type="text/css">
  ul {
    list-style-type: none;
  }
</style>