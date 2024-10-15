<div class="layout">
  <aside>
    <slot name="aside"></slot>
  </aside>

  <main>
    <slot name="main"></slot>
  </main>
</div>

<style>
  .layout {
    display: flex;
    flex-wrap: wrap;
    gap: 2ch;
  }

  aside {
    flex-grow: 1;
    display: flex;
  }

  main {
/*    padding-block-start: var(--baseline);*/
    flex-basis: 0;
    flex-grow: 999;
    min-inline-size: 75%;
  }
</style>