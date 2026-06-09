<script type="text/javascript">
  import BearblogCard from '$lib/components/bearblogCard.svelte'
  import Contribute from '$lib/components/Contribute.svelte'
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

<div class="title-card">
  <h1>Enjoy the World <br><em>Wide</em> Web</h1>
  <p>
    Octothorpes are hashtags and backlinks that can be used on regular websites, connecting pages across the open internet regardless of where they're hosted.
  </p>

  <p>
    This STAGING Server (v0.7rc1) is a network of <mark>{data.thorpes}</mark> <a href="/~">Tags</a> across <mark>{data.domains}</mark> <a href="/domains">Websites</a> and <mark>{data.webrings}</mark> <a href="/webrings">Webrings.</a>
   </p>

</div>

<section class="rails rails-3 testimonials">
  <blockquote class="testimonial">
    <p>The latest web nerd feature.</p>
    <p class="attribution">—&nbsp;Anil Dash</p>
  </blockquote>
  <blockquote class="testimonial">
    <p>You've built something that has enriched a human life a little bit! That's rad as hell.</p>
    <p class="attribution"><a href="https://mastodon.sprawl.club/@ludicity/113354467436519124">—&nbsp;Ludic</a></p>
  </blockquote>
  <blockquote class="testimonial">
    <p>The whole thing is clearly half-baked, written by someone who doesn't understand the meanings and reasons for things.</p>
    <p class="attribution"><a href="https://news.ycombinator.com/item?id=41761873">—&nbsp;Some dude on hackernews</a></p>
  </blockquote>
</section>

<Contribute />


<div class="breaking">
  <header>
    <h2>Server News</h2>
    <p># # # # # # # # # # </p>
  </header>

  <section>
    {#if data.server_name === 'Bear Blog'}
      <date>June 9th, 2025</date>
      <h3><mark>Welcome, Bear Bloggers</mark></h3>
      <p>This is an <a href="https://octothorpe.es/about">Octothorpe relay</a> that lets you use hashtags and backlinks on your blog.</p>
      <p>It's only open to blogs using the Bear platform.</p>
    {:else}
      <img
        class="launch"
        src="/duplu_plane.avif">
      <date>August 1st, 2025</date>
      <h3><mark>Version 0.5 released</mark></h3>
      <p>Take a journey through what <a href="https://docs.octothorp.es/pitch">Octothorpes has to offer</a> on our <a href="https://docs.octothorp.es/">New documentation site.</a></p>
    {/if}
  </section>
</div>

<style type="text/css">

  h1 {
    text-align: center;
    font-family: var(--font-serif);
    font-weight: 400;
    font-size: var(--fs-7);
    line-height: var(--leading-tight);
  }
  .title-card p {
    font-size: var(--fs-4);
    line-height: var(--leading-tight);
    max-width: 18em;
    margin: auto;
    margin-block-end: var(--sp-5);
  }

  /* lewk rails-3 — three equal columns with vertical hairlines, no chrome */
  .testimonials {
    margin-block: var(--sp-5);
  }
  .testimonial {
    margin: 0;
    display: flex;
    flex-direction: column;
  }
  .testimonial p {
    font-size: var(--fs-3);
    line-height: var(--leading-body);
    margin: 0 0 var(--sp-2);
    color: var(--text-color);
  }
  .testimonial .attribution {
    text-align: right;
    margin-block-start: auto;
    color: var(--muted-color);
    font-family: var(--font-ui);
    font-size: var(--fs-2);
  }

  .breaking {
    max-width: 24rem;
    margin-inline: auto;
  }
  .breaking section {
    margin-top: 0;
    background-color: lightgoldenrodyellow;
    padding: 3ch;
  }
  .breaking header {
    margin-block-start: 2rem;
    text-align: center;
  }
  .breaking header h2 {
    font-family: var(--font-serif);
    font-size: var(--fs-4);
    margin-block: 0;
  }
  .breaking  h3 {
    font-family: var(--font-serif);
    font-size: var(--fs-3);
    margin-block-end: 0.5rem;
    margin-block-start: 0.5rem;
  }
  .breaking header p {
    font-weight: bold;
    font-family: var(--font-sans);
    font-size: var(--fs-2);
  }
  .breaking p {
    font-family: var(--font-sans);
    font-size: var(--fs-2);
    line-height: 1.3;
  }
  .launch {
    width: 190px;
    max-width: 40%;
    float: right;
    padding: 1ch;
  }
</style>
