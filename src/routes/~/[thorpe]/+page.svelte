<script type="text/javascript">
  export let data
</script>

<h1>{data.thorpe}</h1>

<ul>
  {#each data.thorpes as thorpe}
    <li>
      <a
        rel="octothorpedBy"
        href="{thorpe}">{thorpe}</a>
    </li>
  {/each}
</ul>