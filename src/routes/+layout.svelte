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

<div class="page op-page">
  <LayoutSidebar>
    <Nav slot="aside" />
    <slot slot="main"></slot>
  </LayoutSidebar>
</div>

<Footer />


<style type="text/css">
  /* lewk's body already provides --page-pad-x/y; just add top breathing room */
  .op-page {
    padding-block-start: var(--sp-4);
  }
</style>
