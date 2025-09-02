<script>
  export let tokens = [];
  export let placeholder = "Add item...";

  let inputValue = '';

  function addToken() {
    const trimmed = inputValue.trim();
    if (trimmed && !tokens.includes(trimmed)) {
      tokens = [...tokens, trimmed];
      inputValue = '';
    }
  }

  function removeToken(index) {
    tokens = tokens.filter((_, i) => i !== index);
  }

  function handleKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addToken();
    }
  }
</script>

<div class="token-input">
  <div class="tokens">
    {#each tokens as token, index}
      <span class="token">
        {token}
        <button type="button" on:click={() => removeToken(index)} class="remove">×</button>
      </span>
    {/each}
    <input
      type="text"
      bind:value={inputValue}
      on:keydown={handleKeydown}
      on:blur={addToken}
      placeholder={placeholder}
      class="token-input-field"
    />
  </div>
</div>

<style>
  .token-input {
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 0.25rem;
    background: white;
  }

  .tokens {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    align-items: center;
  }

  .token {
    background: #e9ecef;
    padding: 0.15rem 0.5rem;
    border-radius: 1rem;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .token .remove {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0;
    color: #6c757d;
  }

  .token .remove:hover {
    color: #dc3545;
  }

  .token-input-field {
    border: none;
    outline: none;
    padding: 0.25rem;
    min-width: 100px;
    flex-grow: 1;
    font-size: 0.8rem;
  }
</style>
