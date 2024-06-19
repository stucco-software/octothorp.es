<script type="text/javascript">
  import DocToc from '$lib/components/DocToc.svelte'
</script>

<nav>
  <DocToc />  
</nav>

<div class="content">
  <slot></slot>
</div>

<style type="text/css">
  nav {
    margin-block-end: var(--baseline);
  }
  .content {
    max-width: 52ch;
  }
</style>