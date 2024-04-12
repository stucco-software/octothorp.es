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
</main>