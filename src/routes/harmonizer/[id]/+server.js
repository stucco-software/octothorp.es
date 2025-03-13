// src/routes/harmonizers/[id]/+server.js
import { json } from '@sveltejs/kit'
import { getHarmonizer } from '$lib/getHarmonizer.js'
import { harmonizeSource } from '$lib/harmonizeSource.js';
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
        // return json(harmonizerCache.get(id));
    }

    // Fetch the harmonizer schema (from predefined harmonizers or an external source)
    const harmonizer = await getHarmonizer(id);

    // Validate the harmonizer
    if (!harmonizer) {
        return json({ error: 'Harmonizer not found' }, { status: 404 });
    }

    // Cache the harmonizer
    harmonizerCache.set(id, harmonizer);


    const blob = `<html>
<body id="thestuff">
  <octo-thorpe>#example1</octo-thorpe>
  <a rel="octo:octothorpes" href="https://octothorp.es/~/term1"></a>
  <octo-thorpe>#example2</octo-thorpe>
  <a rel="octo:octothorpes" href="https://another-domain.com/~/term2"></a>
  <title>Example Title</title>
  <meta name="description" content="Example Description">
  <meta property="og:image" content="https://octothorp.es/image.png">
  <link rel="canonical" href="https://octothorp.es/canonical">
  <meta property="og:url" content="https://octothorp.es/page">
  <div class="h-entry">
    <div class="u-author h-card">
      <span class="p-name">Author Name</span>
      <img class="u-photo" src="https://octothorp.es/author.png">
      <a class="u-url" href="https://octothorp.es/author"></a>
    </div>
  </div>
  <div>
  <code id="the-output">
  </code>
  </div>
</body>
</html>`;

    return json(harmonizer);
    // const { html, definitionName } = request.body;
    
}






// const result = extractDataFromHTML(html, harmonizerDefinitions, 'default');
// console.log(JSON.stringify(result, null, 2));