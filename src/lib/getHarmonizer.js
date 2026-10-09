import { getProfile } from '$lib/profile.js'
import { createHarmonizerRegistry } from 'octothorpes'

const instance = getProfile().identity.instance

const registry = createHarmonizerRegistry(instance)

export const getHarmonizer = registry.getHarmonizer
