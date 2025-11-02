<script>
  export let message = 'Loading...'
</script>

<div class="loading-container">
  <div class="loading-grid loading-grid-even"></div>
  <div class="loading-grid loading-grid-odd"></div>
  <div class="loading-message">{message}</div>
</div>

<style>
  .loading-container {
    position: relative;
    padding: 2rem;
    text-align: center;
    background-color: var(--bg-color);
    overflow: hidden;
    min-height: 400px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .loading-grid {
    position: absolute;
    top: 0;
    left: 0;
    width: 200%;
    height: 100%;
    background-image: url('/wonkgraph.png');
    background-repeat: repeat;
    background-size: auto 150%;
    opacity: 0.8;
  }

  .loading-grid-even {
    animation: shuffle-up 3s ease-in-out infinite;
    mask-image: repeating-linear-gradient(
      to right,
      black 0,
      black 50%,
      transparent 50%,
      transparent 100%
    );
    mask-size: calc(2 * 100px) 100%;
    -webkit-mask-image: repeating-linear-gradient(
      to right,
      black 0,
      black 50%,
      transparent 50%,
      transparent 100%
    );
    -webkit-mask-size: calc(2 * 100px) 100%;
  }

  .loading-grid-odd {
    animation: shuffle-down 3s ease-in-out infinite;
    mask-image: repeating-linear-gradient(
      to right,
      transparent 0,
      transparent 50%,
      black 50%,
      black 100%
    );
    mask-size: calc(2 * 100px) 100%;
    -webkit-mask-image: repeating-linear-gradient(
      to right,
      transparent 0,
      transparent 50%,
      black 50%,
      black 100%
    );
    -webkit-mask-size: calc(2 * 100px) 100%;
  }

  @keyframes shuffle-up {
    0%, 100% {
      transform: translateY(0);
    }
    25% {
      transform: translateY(-10px);
    }
    50% {
      transform: translateY(5px);
    }
    75% {
      transform: translateY(-5px);
    }
  }

  @keyframes shuffle-down {
    0%, 100% {
      transform: translateY(0);
    }
    25% {
      transform: translateY(10px);
    }
    50% {
      transform: translateY(-5px);
    }
    75% {
      transform: translateY(5px);
    }
  }

  .loading-message {
    position: relative;
    z-index: 1;
    font-family: var(--sans-stack);
    font-weight: bold;
    font-size: var(--txt-0);
    color: var(--txt-color);
    background-color: var(--bg-color);
  }
</style>
