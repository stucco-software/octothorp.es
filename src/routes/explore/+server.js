import { json } from '@sveltejs/kit';
import { getMultiPassFromFormState } from '$lib/converters.js';

export async function POST({ request }) {
    try {
        const formData = await request.json();
        
        // Validate required fields
        if (!formData.what || !formData.by) {
            return json(
                { error: 'Missing required fields: what and by are required' },
                { status: 400 }
            );
        }

        // Generate MultiPass from form state
        const multiPass = getMultiPassFromFormState(formData);

        return json({ multiPass });
    } catch (error) {
        console.error('Error generating MultiPass:', error);
        return json(
            { error: 'Failed to generate MultiPass configuration' },
            { status: 500 }
        );
    }
}