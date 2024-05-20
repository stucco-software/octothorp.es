import { defineMDSveXConfig as defineConfig } from "mdsvex";
// import remarkAttr from 'remark-attr'
// import remarkFootnotes from 'remark-footnotes'

const config = defineConfig({
  extensions: [".svelte.md", ".md", ".svx"],

  smartypants: {
    dashes: "oldschool",
  },

  extensions: [".svelte.md", ".md", ".svx"],

  smartypants: {
    dashes: "oldschool",
  },

  remarkPlugins: [], //remarkFootnotes, remarkAttr
  rehypePlugins: [],
});

export default config;
