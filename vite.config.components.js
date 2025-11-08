import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

/**
 * Vite configuration for building Svelte web components
 * This runs separately from the main SvelteKit build
 */
export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        // Enable custom element mode for web components
        customElement: true
      },
      // Exclude this from the main SvelteKit HMR
      hot: false
    })
  ],
  build: {
    lib: {
      // Entry points for each web component
      entry: {
        'octo-thorpe': resolve(__dirname, 'src/lib/web-components/octo-thorpe/OctoThorpe.svelte'),
        'octo-multipass': resolve(__dirname, 'src/lib/web-components/octo-multipass/OctoMultipass.svelte'),
        'octo-multipass-loader': resolve(__dirname, 'src/lib/web-components/octo-multipass-loader/OctoMultipassLoader.svelte')
      },
      // Build as ES modules (modern browsers)
      formats: ['es'],
      // Output filename pattern
      fileName: (format, name) => `${name}.js`
    },
    // Output to static/components/ so it's served by SvelteKit
    outDir: 'static/components',
    // Don't empty the entire directory (might have other static files)
    emptyOutDir: false,
    // Optimize for production
    minify: 'terser',
    sourcemap: true,
    rollupOptions: {
      // Don't bundle these - they're expected in the browser
      external: [],
      output: {
        // Ensure consistent chunking
        manualChunks: undefined
      }
    }
  },
  resolve: {
    alias: {
      // Make shared utilities easy to import
      '@components': resolve(__dirname, 'src/lib/web-components'),
      '@shared': resolve(__dirname, 'src/lib/web-components/shared')
    }
  }
});
