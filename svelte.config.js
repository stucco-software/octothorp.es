import adapter from '@sveltejs/adapter-auto';
import mdsvexConfig from "./mdsvex.config.js";
import { mdsvex } from "mdsvex";


/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
		// If your environment is not supported or you settled on a specific environment, switch out the adapter.
		// See https://kit.svelte.dev/docs/adapters for more information about adapters.
		adapter: adapter(),
		csrf: false
	},
  extensions: [".svelte", ".md"],
  preprocess: [mdsvex(mdsvexConfig)]
};

export default config;
