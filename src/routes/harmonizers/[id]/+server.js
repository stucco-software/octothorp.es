// src/routes/harmonizers/[id]/+server.js
import { json } from '@sveltejs/kit'
import { getHarmonizer } from '$lib/getHarmonizer.js'

// Cache for harmonizer schemas
const harmonizerCache = new Map();



export async function GET({ params }) {
    const { id } = params;

    // Validate the ID
    if (!id || typeof id !== 'string') {
        return json({ error: 'Invalid harmonizer ID' }, { status: 400 });
    }

    // Check the cache first
    if (harmonizerCache.has(id)) {
        return json(harmonizerCache.get(id));
    }

    // Fetch the harmonizer schema (from predefined harmonizers or an external source)
    const harmonizer = await getHarmonizer(id);

    // Validate the harmonizer
    if (!harmonizer) {
        return json({ error: 'Harmonizer not found' }, { status: 404 });
    }

    // Cache the harmonizer
    harmonizerCache.set(id, harmonizer);

    // Return the harmonizer schema
    return json(harmonizer);
}