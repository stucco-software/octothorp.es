import { instance } from '$env/static/private'
import { createHarmonizerRegistry } from '$lib/harmonizers.js'

const registry = createHarmonizerRegistry(instance)

export const getHarmonizer = registry.getHarmonizer
