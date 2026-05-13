<script type="text/javascript">
  import Lockup from './Lockup.svelte'
  export let host
  export let data
  import StaticNav from './Nav.svelte'
</script>

<header class="op-header">
	<a href="/">
    <Lockup {host} />
  </a>
</header>
<StaticNav />


<style type="text/css">
  .op-header {
    padding-block: var(--sp-2);
    display: flex;
    justify-content: center;
    border-bottom: var(--rule-strong);
    background-color: var(--bg);
  }
  a {
    text-decoration-skip-ink: auto;
    text-decoration: none;
    color: currentColor;
  }
</style>
