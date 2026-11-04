import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => ({
	plugins: [sveltekit()],
	server: {
		fs: {
			allow: ['packages/core'],
		},
	},
	test: {
		include: ['src/**/*.{test,spec}.js'],
	    includeSource: ['src/**/*.js'],
		// Live-store tests read process.env.sparql_*; without this they fall back
		// to :7878 regardless of .env, which may be a pre-RDF-1.2 Oxigraph.
		env: loadEnv(mode, process.cwd(), 'sparql_'),
	}
}));
