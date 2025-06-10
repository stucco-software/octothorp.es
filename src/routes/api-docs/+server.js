import { json } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function GET() {
    const openapiSpec = fs.readFileSync(
        path.join(__dirname, '../../../lib/openapi.yaml'),
        'utf8'
    );

    return new Response(openapiSpec, {
        headers: {
            'Content-Type': 'application/yaml'
        }
    });
} 