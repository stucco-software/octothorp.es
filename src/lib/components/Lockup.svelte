<script>
	export let host
</script>

<div>
	<span>#</span><span>#</span><span>#</span><span>#</span><span>#</span><span>#</span>{host}
</div>

<style>
	div {
		font-family: "DOS";
		font-size: var(--txt-0);
	}
	span {
		--wave: 0ch;
		--length: 0.66ch;
		display: inline-block;
		font-size: var(--txt-1);
		font-style: italic;
		margin-inline-end: calc(-1 * var(--length));
	}
/*
  *
 * * *
*   *
*/
	span:nth-child(1) {
		color: whitesmoke;
		transform: translate3d(10px, 0px, 0px);
		transform: translate3d(0, calc(var(--wave) * -1), 0);
	}
	span:nth-child(2) {
		color: yellow;
		transform: translate3d(10px, 0px, 0px);
		transform: translate3d(0, calc(var(--wave) * 0), 0);
	}
	span:nth-child(3) {
		color: lime;
		transform: translate3d(10px, 0px, 0px);
		transform: translate3d(0, calc(var(--wave) * 1), 0);
	}
	span:nth-child(4) {
		color: red;
		transform: translate3d(10px, 0px, 0px);
		transform: translate3d(0, calc(var(--wave) * 0), 0);
	}
	span:nth-child(5) {
		color: blue;
		transform: translate3d(10px, 0px, 0px);
		transform: translate3d(0, calc(var(--wave) * -1), 0);
	}
	span:last-child {
		margin-inline-end: 0ch;
		transform: translate3d(0, calc(var(--wave) * 0), 0);
	}
</style>