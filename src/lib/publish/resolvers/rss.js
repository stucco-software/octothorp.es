/**
 * RSS 2.0 Item Resolver
 * 
 * Converts blobjects to RSS 2.0 item format.
 * @see http://purl.org/rss/1.0/
 */
export const rssItem = {
  "@context": "http://purl.org/rss/1.0/",
  "@id": "https://octothorp.es/publishers/rss.item",
  "@type": "resolver",
  meta: {
    name: "RSS 2.0 Item",
    description: "Converts blobjects to RSS 2.0 item format"
  },
  schema: {
    title: { 
      from: ["title", "@id"], 
      required: true 
    },
    link: { 
      from: "@id", 
      required: true 
    },
    guid: { 
      from: "@id" 
    },
    pubDate: { 
      from: "date", 
      postProcess: { method: "date", params: "rfc822" },
      required: true 
    },
    description: { 
      from: "description" 
    },
    image: { 
      from: "image" 
    }
  }
}

/**
 * RSS 2.0 Channel Resolver
 * 
 * Converts channel metadata to RSS 2.0 channel format.
 * Used for feed-level metadata, not individual items.
 */
export const rssChannel = {
  "@context": "http://purl.org/rss/1.0/",
  "@id": "https://octothorp.es/publishers/rss.channel",
  "@type": "resolver",
  meta: {
    name: "RSS 2.0 Channel",
    description: "Converts metadata to RSS 2.0 channel format"
  },
  schema: {
    title: { 
      from: "title", 
      required: true 
    },
    link: { 
      from: "link", 
      required: true 
    },
    description: { 
      from: "description" 
    },
    pubDate: { 
      from: "pubDate", 
      postProcess: { method: "date", params: "rfc822" } 
    }
  }
}
