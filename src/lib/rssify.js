// Untested Private Functions
// Tests get rolled into Public Functions
const encodedStr = rawStr => rawStr ? rawStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;') : ''
const rssDescription = d => d ? `<description>${encodedStr(d)}</description>` : ``
const rssID = l => l ? `<guid isPermaLink="true">${encodedStr(l)}</guid>` : ``
const rssTitle = t => t ? `<title>${encodedStr(t)}</title>` : ``
const rssLink = l => l ? `<link>${encodedStr(l)}</link>` : ``
const rssCategory = c => c ? `<category>${c}</category>` : ``
const rssPubDate = d => d ? `<pubDate>${(new Date(d)).toUTCString()}</pubDate>` : ``
const rssAuthor = a => a && a.guid ? `<author>${encodedStr(a.guid)}</author>` : ``
const rssImage = i => i ? `<enclosure url="${encodedStr(i)}" type="image/jpeg" />` : ``
const atomLink = l => l ? `<atom:link href="${encodedStr(l)}" rel="self" type="application/rss+xml" />` : ``

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  
  let json_node = {
    title: "Some Node",
    description: "This is some sort of node.",
    author: {
      name: 'Test Author',
      guid: 'https://example.com/author'
    },
    guid: 'https://example.com/node',
    pubDate: "June 21st, 2024",
    link: 'https://example.com/link'
  }

  it.skip('Turns… JSON into… an RSS node?', async () => {
    // TEST TK: String matching sucks!
    expect(rssItem(json_node))
      .toMatch(`
<item>
  <title>Some Node</title>
  <description>This is some sort of node.</description>
  <author>https://example.com/author</author>
  <guid isPermaLink="true">https://example.com/node</guid>
  <pubDate>Invalid Date</pubDate>
  <link>https://example.com/link</link>
</item>`)
  })

  let invalid_date = {
    title: "Some Node",
    description: "This is some sort of node.",
    pubDate: "THIS IS NOT A DATE"
  }
  it('Returns an empty string if pubDate is invalid', async () => {
    expect(rssItem(invalid_date))
      .toStrictEqual(``)
  })  

  let no_title_or_desc = {
    pubDate: "2024.06.21"
  }
  it('Returns an empty string if neither title nor description present', async () => {
    expect(rssItem(no_title_or_desc))
      .toStrictEqual(``)
  })  
}
const rssItem = item => (new Date(item.pubDate)).toUTCString() != "Invalid Date" && (item.title || item.description) ? `
  <item>
  ${rssTitle(item.title)}
  ${rssDescription(item.description)}
  ${rssAuthor(item.author)}
  ${rssID(item.guid)}
  ${rssPubDate(item.pubDate)}
  ${rssLink(item.link)}
  ${rssCategory(item.category)}
  ${rssImage(item.image)}
</item>` : ''

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it.skip('Turns… JSON into… an RSS feed?', async () => {
    // TEST TK: String matching sucks!
    expect({"wow": "cool"})
      .toStrictEqual(`some xml bullshit I guess?`)
  })
}

// Convert parseBindings results to RSS items
const convertParseBindingsToRssItems = (results) => {
  return results.map(item => {
    const rssItem = {
      title: item.title || item.term || item.uri,
      description: item.description,
      guid: item.uri || item.term,
      link: item.uri,
      pubDate: item.date ? new Date(item.date).toUTCString() : new Date().toUTCString(),
      image: item.image
    };
    return rssItem;
  });
};

// Convert getBlobjectFromResponse results to RSS items
const convertBlobjectToRssItems = (results) => {
  return results.map(item => {
    const rssItem = {
      title: item.title || item['@id'],
      description: item.description,
      guid: item['@id'],
      link: item['@id'],
      pubDate: item.date ? new Date(item.date).toUTCString() : new Date().toUTCString(),
      image: item.image
    };
    return rssItem;
  });
};

export const rss = (tree, what = "pages") => {
  // Determine if we're dealing with blobjects or parseBindings results
  const isBlobject = what === "everything";
  
  // Convert results to RSS items based on the flag
  const items = isBlobject ? convertBlobjectToRssItems(tree.channel.items) : convertParseBindingsToRssItems(tree.channel.items);
  
  return `
  <rss
    xmlns:atom="http://www.w3.org/2005/Atom"
    version="2.0">
    <channel>
      ${rssTitle(tree.channel.title)}
      ${rssLink(tree.channel.link)}
      ${atomLink(tree.channel.link)}
      ${rssDescription(tree.channel.description)}
      ${rssPubDate(tree.channel.pubDate)}
      <lastBuildDate>${(new Date).toUTCString()}</lastBuildDate>
      ${items.map(item => rssItem(item)).join('')}
    </channel>
  </rss>
`
}