// src/lib/utils/harmonizerPicker.js
import { instance } from '$env/static/private';

// Cache for harmonizer schemas
const harmonizerCache = new Map();

// Shared context and base ID
const context = `${instance}/context.json`;
const baseId = `${instance}/harmonizers/`;

// Predefined harmonizer schemas (can be loaded from a file or database)
const predefinedHarmonizers = {
    "webmention-client": {
        "@context": context,
        "@id": `${baseId}article`,
        "@type": "Harmonizer",
        "title": "Client-side Webmention to backlink harmonizer",
        "mode": "html",
        "BacklinkObject": {
            "object": {
                "selector": "a.u-in-reply-to",
                "attribute": "href"
            },
            // no specified subject = default to page url
        },
        "DocumentRecord": {
            "author": {
                "name": {
                    "selector": ".h-entry .u-author.h-card .p-name",
                    // this might not always work but hey it's their schema
                    "attribute": "innerHtml"
                },
                "photo": {
                    "selector": ".h-entry .u-author.h-card .u-photo",
                    // this might not always work but hey it's their schema
                    "attribute": "src"
                },
                "url": {
                    "selector": ".h-entry .u-author.h-card .u-url",
                    // this might not always work but hey it's their schema
                    "attribute": "href"
                }
            },
            "content": {
            // this is just hardcoded to be spec compliant. seems fine to do
                "content-type": "text/html",
            // this is psychotic but the webmention.io response returns the whole element
            // TWICE and then also the inner html
            // so might as well create a hook for parsing both.
                "value": {
                    "selector": ".h-entry .e-content",
                    "attribute": "outerHtml"    
                },
                "html": {
                    "selector": ".h-entry .e-content",
                    "attribute": "outerHtml"    
                },
                "html": {
                    "selector": ".h-entry .e-content",
                    "attribute": "innerHtml"    
                }
            },

        }
        },
    "article": {
        "@context": context,
        "@id": `${baseId}article`,
        "title": "SKOS: Basic Article Harmonizer",
        "mode": "json",
        "type": "Article",
        "fields": {
            "headline": { "path": "headline" },
            "description": { "path": "description" },
            "author": { "path": "author.name" },
            "datePublished": { "path": "datePublished" },
            "publisher": { "path": "publisher.name" },
            "image": { "path": "image.url" }
        }
    },
    "seo": {
        "@context": context,
        "@id": `${baseId}seo`,
        "mode": "html",
        "fields": {
            "title": {
                "selector": "meta[property='og:title'], meta[name='twitter:title'], title",
                "attribute": "content"
            },
            "description": {
                "selector": "meta[property='og:description'], meta[name='twitter:description'], meta[name='description']",
                "attribute": "content"
            },
            "image": {
                "selector": "meta[property='og:image'], meta[name='twitter:image']",
                "attribute": "content"
            }
        }
    },
    "product": {
        "@context": context,
        "@id": `${baseId}product`,
        "mode": "json",
        "type": "Product",
        "fields": {
            "name": { "path": "name" },
            "description": { "path": "description" },
            "price": { "path": "offers.price" },
            "brand": { "path": "brand.name" }
        }
    }
    // Add more harmonizers as needed
};

/**
 * Fetches a harmonizer schema by ID.
 * @param {string} id - The harmonizer ID.
 * @returns {Promise<object|null>} - The harmonizer schema or null if not found.
 */
export async function getHarmonizer(id) {
    // Validate the ID
    if (!id || typeof id !== 'string') {
        throw new Error('Invalid harmonizer ID');
    }

    // Check the cache first
    if (harmonizerCache.has(id)) {
        return harmonizerCache.get(id);
    }

    // Fetch the harmonizer schema (from predefined harmonizers or an external source)
    const harmonizer = predefinedHarmonizers[id];

    // Validate the harmonizer
    if (!harmonizer) {
        throw new Error('Harmonizer not found');
    }

    // Cache the harmonizer
    harmonizerCache.set(id, harmonizer);

    // Return the harmonizer schema
    return harmonizer;
}