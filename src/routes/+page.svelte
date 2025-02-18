<script type="text/javascript">
  import BearblogCard from '$lib/components/bearblogCard.svelte'
  export let data
  export let server_name
  import { assets } from '$app/paths';
  let rss = `${data.instance}rss/`
</script>

<link
  rel="alternate"
  type="application/rss+xml"
  title={data.instance}
  href={rss}>



<div class="dashboard dotgrid">
<section>
  {#if data.server_name === 'Octothorpes'}
    <p>Welcome to the first Octothorpes Server.</p>
  {:else}
    <p>Welcome to the {data.server_name} Server</p>
  {/if}
  <p># # # # # # # # # # # </p>
  <p>
    This Ring is a network of <mark>{data.thorpes}</mark> <a href="/~">tags</a>, <mark>{data.links}</mark> <a href="/backlinks">backlinks</a> and <mark>{data.assertions}</mark> <a href="/bookmarks">bookmarks</a> across <mark>{data.domains}</mark> <a href="/domains">websites.</a>
   </p>

  <p>   <a href="https://octothorp.es"><img src="{assets}/badge.png" alt="Badge for the Octothorpes main ring" /></a>
  </p>
</section>

  
  {#if data.server_name === 'Bear Blog'}
  <section>
    <BearblogCard></BearblogCard>
  </section>
  {:else}
  <section>
    <em>News from the Ring</em>
    <p># # # # # # # # # # # </p>
    <!-- <p>Please stand by while we resolve resolve technical difficulties.</p> -->
    <p>Registrations are open again for <a href="/ratbike">Project Ratbike</a></p>
    <p># # # # # # # # # # # </p>
    <a href="https://bearblog.octothorp.es/">Welcome Bear Bloggers!</a> <p>All Blogs on Bear can now octothorpe on their own server!</p>
  </section>
  <section class="testimonial">
  
    <p>The latest web nerd feature.</p>
    <p class="attribution">-- Anil Dash</p>
  
    <p>You've built something that has enriched a human life a little bit! That's rad as hell.</p>
    <p class="attribution">-- <a href="https://mastodon.sprawl.club/@ludicity/113354467436519124">Ludic</a></p>
  
    <p>The whole thing is clearly half-baked, written by someone who doesn't understand the meanings and reasons for things.</p>
    <p class="attribution">-- <a href="https://news.ycombinator.com/item?id=41761873">Some dude on hackernews</a></p>
  </section>
  {/if}
</div>

<style type="text/css">
  h1 {
    word-break: break-all;
  }
  .dashboard {
    display: grid;
    grid-template-columns: repeat(auto-fill, 24ch);
    gap: 4ch;
    grid-auto-rows: max-content
  }

  .dashboard {
    /* border-top: 16px solid var(--bg-color); */
    font-family: "DOS";

  }
  .dashboard section, .dashboard p span {
  background-color: lightgoldenrodyellow;
  outline: 1ch solid var(--bg-color);
}
  .dashboard section {
    padding: 1ch 1ch 2ch 1ch;
  }
  section.testimonial {
    color: var(--bios-gray);
    background-color: var(--bg-color) ;
    font-size: 75%;
  }

  section.testimonial p a {
    color: var(--bios-gray);
  }
  
  section.testimonial p {
    line-height: 1rem;
    margin-block-end: 1rem;
    padding: .5ch;
  }

  section.testimonial p:hover {
    color: blue;
  }
  hr {
    border: 2px dashed var(--bg-color);
  }

  .attribution {
    text-align: right;
}
</style>