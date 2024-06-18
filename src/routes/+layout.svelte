<script type="text/javascript">
  import { page } from '$app/stores';
  import LayoutSidebar from '$lib/components/LayoutSidebar.svelte'
  import Header from '$lib/components/Header.svelte'
  import Nav from '$lib/components/Nav.svelte'
  import Footer from '$lib/components/Footer.svelte'  
  export let data
</script>

<pushbroom url={$page.url.pathname} />

<Header host={data.host} />
<LayoutSidebar>
  <Nav slot="aside" />    
  <slot slot="main"></slot>
</LayoutSidebar>
<Footer />
