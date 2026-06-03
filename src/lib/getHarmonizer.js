import { instance } from '$lib/config.js'
import { createHarmonizerRegistry } from '$lib/harmonizers.js'

const registry = createHarmonizerRegistry(instance)

export const getHarmonizer = registry.getHarmonizer
