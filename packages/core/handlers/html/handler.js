import schema from './schema.json' with { type: 'json' }
import { harmonizeSource } from '../../harmonizeSource.js'

export default {
  ...schema,
  harmonize: (content, harmonizerSchema, options) => {
    return harmonizeSource(content, harmonizerSchema, options)
  }
}
