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
    gap: var(--baseline);
  }

  .layout > :first-child {
    flex-grow: 1;
  }

  .layout > :last-child {
    flex-basis: 0;
    flex-grow: 999;
    min-inline-size: 75%;
  }
</style>