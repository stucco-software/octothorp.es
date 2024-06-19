<script type="text/javascript">
  export let span
  export let height
  export let clear = false
</script>

<section class="tk" style="
  --span: {span};
  --height: {height};
  --bg: {clear ? 'transparent' : 'var(--bg-color)'};
  --border: {clear ? 'transparent' : 'var(--txt-color)'};
">
  <slot></slot>
</section>

<style>
  .tk {
    grid-column: span var(--span, 1);
    grid-row: span var(--height, 1);
    border: 2px solid var(--border);
    background-color: var(--bg);
    padding-inline: 1ch;
    padding-block: calc(var(--baseline) / 2);
  }
</style>