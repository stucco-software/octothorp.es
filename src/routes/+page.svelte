<script type="text/javascript">
  import TKCard from '$lib/components/TKCard.svelte'
  export let data
  let rss = `${data.instance}rss/`
</script>

<link
  rel="alternate"
  type="application/rss+xml"
  title={data.instance}
  href={rss}>

<h1>{data.instance}</h1>

<section class="dotgrid">
  <p>
    <span>This Octothorpes Ring is a network of <mark>{data.thorpes}</mark> <a href="/~">tags</a>, <mark>{data.links}</mark> backlinks and <mark>{data.assertions}</mark> bookmarks across <mark>{data.domains}</mark> <a href="/domains">websites.</a></span>
  </p>
</section>

<style type="text/css">
  h1 {
    word-break: break-all;
  }
  .dashboard {
    display: grid;
    grid-template-columns: repeat(auto-fill, 21ch);
    gap: 1ch;
    grid-auto-rows: minmax(0, auto);
  }
</style>