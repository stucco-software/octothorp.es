<script type="text/javascript">
  export let data
</script>

<h1>{data.instance}</h1>
<section>
  {#each data.thorpes as thorpe}
  <p>
    <a class="thorpe" href="{thorpe}">#{thorpe.split('/~/')[1]}</a>
  </p>
  {/each}
</section>

<style type="text/css">
  h1 {
    word-break: break-all;
  }
</style>