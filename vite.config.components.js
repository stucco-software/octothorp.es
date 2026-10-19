import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import { existsSync, readdirSync, rmSync } from 'fs';

const outDir = resolve(__dirname, 'static/components');

/**
 * static/components/ also holds hand-written demo HTML pages, so we can't use
 * emptyOutDir. Instead, delete previous build output (hashed chunks included)
 * before each build so stale content-hashed files don't accumulate (#254).
 */
function cleanComponentBuildOutput() {
  return {
    name: 'clean-component-build-output',
    buildStart() {
      if (!existsSync(outDir)) return;
      for (const file of readdirSync(outDir)) {
        if (file.endsWith('.js') || file.endsWith('.js.map')) {
          rmSync(resolve(outDir, file));
        }
      }
    }
  };
}

/**
 * Vite configuration for building Svelte web components
 * This runs separately from the main SvelteKit build
 */
export default defineConfig({
  plugins: [
    cleanComponentBuildOutput(),
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
        'octo-multipass-loader': resolve(__dirname, 'src/lib/web-components/octo-multipass-loader/OctoMultipassLoader.svelte'),
        'octo-backlinks': resolve(__dirname, 'src/lib/web-components/octo-backlinks/OctoBacklinks.svelte'),
        'octo-badge': resolve(__dirname, 'src/lib/web-components/octo-badge/OctoBadge.svelte')
      },
      // Build as ES modules (modern browsers)
      formats: ['es'],
      // Output filename pattern
      fileName: (format, name) => `${name}.js`
    },
    // Output to static/components/ so it's served by SvelteKit
    outDir: 'static/components',
    // Never empty the whole directory: it also holds hand-written demo HTML.
    // Stale JS/map cleanup is handled by cleanComponentBuildOutput above.
    emptyOutDir: false,
    // Optimize for production
    minify: 'terser',
    // No sourcemaps: static/ is served publicly and maps would expose the full
    // component source. Flip to true locally if you need to debug a build.
    sourcemap: false,
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
