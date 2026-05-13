<div class="split split--wide op-layout">
  <main>
    <slot name="main"></slot>
  </main>
</div>

<style>
  /* extend lewk .split — on small screens the slot collapses to one column;
   * the aside slot is unused on most routes so we don't render it */
  .op-layout {
    align-items: start;
  }
</style>
