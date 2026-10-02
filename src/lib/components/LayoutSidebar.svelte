<div class="layout">
 

  <main >
    <slot name="main"></slot>
  </main>
</div>

<style>
  .layout {
    display: flex;
    flex-wrap: wrap;
    gap: 2ch;
  }



  main {
/*    padding-block-start: var(--baseline);*/
    flex-basis: 0;
    flex-grow: 999;
    min-inline-size: 75%;
  }
</style>