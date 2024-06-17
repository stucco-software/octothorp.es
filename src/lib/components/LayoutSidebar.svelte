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
    border-left: 1px solid blue;
  }

  .layout > :last-child {
    flex-basis: 0;
    flex-grow: 999;
    min-inline-size: 75%;
    border-left: 1px solid blue;
  }
</style>