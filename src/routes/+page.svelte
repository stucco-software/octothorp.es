<script type="text/javascript">
  import TKCard from '$lib/components/TKCard.svelte'
  export let data
</script>

<h1>{data.instance}</h1>

<section class="dotgrid">
  <p>
    <span>This Octothorpes Ring is a network of <mark>{data.thorpes}</mark> <a href="/~">tags</a> and <mark>{data.links}</mark> backlinks across <mark>{data.domains}</mark> <a href="/domains">websites.</a></span>
  </p>

  <div class="dashboard">
    <TKCard span="2">
      Instance search field
    </TKCard>
    <TKCard>
      Some sort of heartbeat monitor; users on this site, pings to the server from other origins, other real-time data.
    </TKCard>
    <TKCard>
      Most recently created Terms
    </TKCard>
    <TKCard>
      Terms with the mostest
    </TKCard>
    <TKCard clear height="2">
      Filler Illustration
    </TKCard>
    <TKCard span="2">
      Recent x Popular Terms for some sort of trending view.
    </TKCard>
    <TKCard clear>
      Filler Illustration
    </TKCard>
    <TKCard span="2">
      Network diagram of pages, terms, and domains
    </TKCard>
    <TKCard>
      RSS Feed
    </TKCard>
    <TKCard>
      ActivityPub Links
    </TKCard>
    <TKCard>
      Admin Login
    </TKCard>
  </div>
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