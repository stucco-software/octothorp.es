// src/routes/harmonizer/[id]/+server.js
import { json } from '@sveltejs/kit'
import { isQueryError } from 'octothorpes'
import { getHarmonizer } from '$lib/getHarmonizer.js'

export async function GET({ params }) {
    const { id } = params;

    // The registry throws typed caller errors (400 invalid id, 404 unknown id);
    // anything else is a genuine failure and stays a 500.
    try {
        return json(await getHarmonizer(id));
    } catch (e) {
        if (isQueryError(e)) {
            return json({ error: e.message }, { status: e.status ?? 400 });
        }
        throw e;
    }
}
