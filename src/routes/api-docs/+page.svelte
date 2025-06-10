<script>
    import { onMount } from 'svelte';
    import SwaggerUI from 'swagger-ui';
    import 'swagger-ui/dist/swagger-ui.css';

    let container;

    onMount(async () => {
        const response = await fetch('/api-docs');
        const spec = await response.json();
        
        SwaggerUI({
            spec: spec,
            domNode: container,
            deepLinking: true,
            presets: [
                SwaggerUI.presets.apis,
                SwaggerUI.SwaggerUIStandalonePreset
            ]
        });
    });
</script>

<div class="swagger-container" bind:this={container}></div>

<style>
    .swagger-container {
        width: 100%;
        height: 100vh;
    }
</style> 