import { json } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function GET() {
    const openapiSpec = fs.readFileSync(
        path.join(__dirname, 'openapi.yaml'),
        'utf8'
    );
    // Parse YAML to JSON
    const spec = yaml.load(openapiSpec);

    return json(spec);
} 