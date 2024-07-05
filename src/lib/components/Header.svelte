<script type="text/javascript">
  import Lockup from './Lockup.svelte'
  export let host
</script>
<header>
	<a href="/">
    <Lockup {host} />
  </a>
</header>

<style type="text/css">
  header {
    border-bottom: 2px dotted var(--dark-blue);
    padding-block: var(--baseline);
    padding-inline: 2ch;
  }

  a {
    text-decoration-skip-ink: auto;
    text-decoration: none;
    color: currentColor;
  }  
</style>