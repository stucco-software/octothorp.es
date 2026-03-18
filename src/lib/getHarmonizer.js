import { instance } from '$env/static/private'
import { createHarmonizerRegistry } from 'octothorpes'

const registry = createHarmonizerRegistry(instance)

export const getHarmonizer = registry.getHarmonizer
