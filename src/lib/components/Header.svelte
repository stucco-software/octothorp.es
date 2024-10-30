<script type="text/javascript">
  import Lockup from './Lockup.svelte'
  export let host
  export let data
  import StaticNav from './Nav.svelte'
</script>

<header>
	<a href="/">
    <Lockup {host} />
  </a>
</header>
<StaticNav /> 




<style type="text/css">
  header {
    border-bottom: 2px dotted var(--dark-blue);
    padding-block: calc(var(--baseline) * .5);
    padding-inline: 2ch;
  }




  a, li a {
    text-decoration-skip-ink: auto;
    text-decoration: none;
    color: currentColor;
  }  
</style>