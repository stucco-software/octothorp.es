import { harmonizeSource } from '../../harmonizeSource.js'

export default {
  mode: 'html',
  contentTypes: ['text/html', 'application/xhtml+xml'],
  meta: {
    name: 'HTML Handler',
    description: 'Extracts metadata from HTML using CSS selectors via JSDOM',
  },
  harmonize: (content, harmonizerSchema, options) => {
    return harmonizeSource(content, harmonizerSchema, options)
  }
}
