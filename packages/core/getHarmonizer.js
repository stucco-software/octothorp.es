import { createHarmonizerRegistry } from './harmonizers.js'

const registry = createHarmonizerRegistry('https://octothorp.es/')

export const getHarmonizer = registry.getHarmonizer
