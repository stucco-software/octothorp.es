import { instance } from '$lib/config.js'
import { createHarmonizerRegistry } from 'octothorpes'

const registry = createHarmonizerRegistry(instance)

export const getHarmonizer = registry.getHarmonizer
