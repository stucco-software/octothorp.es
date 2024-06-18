<script type="text/javascript">
  import DocToc from '$lib/components/DocToc.svelte'
</script>

<nav>
  <DocToc />  
</nav>

<slot></slot>

<style type="text/css">
  nav {
    margin-block-end: var(--baseline);
  }
</style>