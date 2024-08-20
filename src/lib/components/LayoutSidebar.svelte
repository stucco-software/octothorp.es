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
    padding-inline: 2ch;
  }

  .layout > :first-child {
    flex-grow: 1;
    display: flex;
  }

  .layout > :last-child {
    padding-block-start: var(--baseline);
    flex-basis: 0;
    flex-grow: 999;
    min-inline-size: 75%;
  }
</style>