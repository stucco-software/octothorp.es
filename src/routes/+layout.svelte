<script type="text/javascript">
  import { page } from '$app/stores';
  import LayoutSidebar from '$lib/components/LayoutSidebar.svelte'
  import Header from '$lib/components/Header.svelte'
  import Nav from '$lib/components/Nav.svelte'
  import Footer from '$lib/components/Footer.svelte'  
  export let data
</script>

<push-broom url={$page.url.pathname} />

<Header host={data.host} />

<div class="container">
  <LayoutSidebar>
    <Nav slot="aside" />
    <slot slot="main"></slot>
  </LayoutSidebar>
</div>

<Footer />


<style type="text/css">
  .container {
    padding-inline: 2ch;
    padding-block-start: var(--baseline);
  }
</style>