<script>
  import { createEventDispatcher } from 'svelte';

  export let tokens = [];
  export let placeholder = '';

  let inputValue = '';
  const dispatch = createEventDispatcher();

  function handleKeydown(event) {
    if (event.key === 'Enter') {
      if (inputValue.trim()) {
        event.preventDefault();
        addToken();
      }
    } else if (event.key === ',') {
      event.preventDefault();
      addToken();
    } else if (event.key === 'Backspace' && inputValue === '' && tokens.length > 0) {
      removeToken(tokens.length - 1);
    }
  }

  function addToken() {
    const newTokens = inputValue
      .split(',')
      .map(t => t.trim())
      .filter(t => t !== '' && !tokens.includes(t));

    if (newTokens.length > 0) {
      tokens = [...tokens, ...newTokens];
      dispatch('change', { tokens });
    }
    inputValue = '';
  }

  function removeToken(index) {
    tokens = tokens.filter((_, i) => i !== index);
    dispatch('change', { tokens });
  }
</script>

<div class="token-input-container">
  <div class="tokens">
    {#each tokens as token, index}
      <div class="token">
        <span>{token}</span>
        <button on:click={() => removeToken(index)}>&times;</button>
      </div>
    {/each}
  </div>
  <input
    type="text"
    bind:value={inputValue}
    on:keydown={handleKeydown}
    on:blur={addToken}
    {placeholder}
  />
</div>

<style>
.token-input-container {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.15rem;
  background: white;
  width: 100%;
}
.tokens {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem;
  padding-right: 0.5rem;
}
.token {
  display: flex;
  align-items: center;
  background-color: #e9ecef;
  padding: 0.15rem 0.35rem;
  border-radius: 1rem;
  font-size: 0.55rem;
}
.token button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 0.15rem;
  margin-left: 0.15rem;
  font-size: 0.7rem;
  color: #6c757d;
  line-height: 1;
}
.token button:hover {
  color: #343a40;
}
input {
  flex-grow: 1;
  border: none;
  outline: none;
  padding: 0.25rem;
  background: transparent;
  font-size: 0.6rem;
}
</style> 