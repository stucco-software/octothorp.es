
export async function extractData(html, schema) {
    const output = {};
  
    // Helper function to extract values based on a schema rule
    function extractValues(html, rule) {
      if (typeof rule === "string") {
        // If the rule is a string, return it as-is
        return [rule];
      }
  
      const { selector, attribute, postprocess } = rule;
      const elements = html.querySelectorAll(selector);
      const values = Array.from(elements).map((element) => {
        let value = element[attribute];
  
        // Apply postprocessing if defined
        if (postprocess && postprocess.method === "regex") {
          const regex = new RegExp(postprocess.params);
          const match = value.match(regex);
          if (match) {
            value = match[1]; // Use the captured group
          }
        }
  
        return value;
      });
  
      return values;
    }
  
    // Helper function to set a nested property in an object
    function setNestedProperty(obj, keyPath, value) {
      const keys = keyPath.split(".");
      let current = obj;
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!current[key]) {
          current[key] = {};
        }
        current = current[key];
      }
      current[keys[keys.length - 1]] = value;
    }
  
    // Process each top-level object in the schema
    for (const key in schema) {
      const { s, o } = schema[key];
      const sValues = extractValues(html, s); // Extract all s values
  
      // Special handling for schema.subject and schema.DocumentRecord
      if (key === "subject" || key === "DocumentRecord") {
        output[key] = {};
  
        // Process each rule in the "o" array
        o.forEach((rule) => {
          const values = extractValues(html, rule);
  
          // Use the "key" property to reconstruct the nested structure
          if (rule.key) {
            setNestedProperty(output[key], rule.key, values);
          } else {
            // If no key is provided, add the values directly
            output[key] = values;
          }
        });
      } else {
        // Default handling for other top-level objects
        const oValues = [];
  
        // Process each rule in the "o" array
        o.forEach((rule) => {
          const values = extractValues(html, rule);
  
          // If the rule has a "key", use it to reconstruct the nested structure
          if (rule.key) {
            setNestedProperty(oValues, rule.key, values);
          } else {
            // Otherwise, add the values directly to the oValues array
            oValues.push(...values);
          }
        });
  
        // Combine s and o values into pairs
        output[key] = sValues.flatMap((sVal) =>
          oValues.map((oVal) => [sVal, oVal])
        );
      }
    }
  
    return output;
  }

const schema = {
    hashtags: {
      s: "source", // s can be a string
      o: [
        {
          selector: "octo-thorpe",
          attribute: "textContent",
        },
        {
          selector: "[rel='octo:octothorpes']",
          attribute: "href",
          postprocess: {
            method: "regex",
            params: "https?://example.com/~/([^/]+)",
          },
        },
      ],
    },
    backlinks: {
      s: {
        selector: "link[rel='canonical']", // s can also be a selector/attribute group
        attribute: "href",
      },
      o: [
        {
          selector: "octo-thorpe",
          attribute: "textContent",
        },
        {
          selector: "[rel='octo:octothorpes']",
          attribute: "href",
        },
      ],
    },
    subject: {
      s: "source",
      o: [
        {
          selector: "title",
          attribute: "textContent",
          key: "title",
        },
        {
          selector: "meta[name='description']",
          attribute: "content",
          key: "description",
        },
        {
          selector: "meta[property='og:image']",
          attribute: "content",
          key: "image",
        },
      ],
    },
    DocumentRecord: {
      s: {
        selector: "meta[property='og:url']", // s can also have postprocessing
        attribute: "content",
        postprocess: {
          method: "regex",
          params: "https?://([^/]+)",
        },
      },
      o: [
        {
          selector: ".h-entry .u-author.h-card .p-name",
          attribute: "innerHTML",
          key: "author.name",
        },
        {
          selector: ".h-entry .u-author.h-card .u-photo",
          attribute: "src",
          key: "author.photo",
        },
        {
          selector: ".h-entry .u-author.h-card .u-url",
          attribute: "href",
          key: "author.url",
        },
      ],
    },
  };
  
  

  
  const html = document.createElement("div");
  html.innerHTML = `
    <octo-thorpe>#example1</octo-thorpe>
    <a rel="octo:octothorpes" href="https://example.com/~/term1"></a>
    <octo-thorpe>#example2</octo-thorpe>
    <a rel="octo:octothorpes" href="https://another-domain.com/~/term2"></a>
    <title>Example Title</title>
    <meta name="description" content="Example Description">
    <meta property="og:image" content="https://example.com/image.png">
    <link rel="canonical" href="https://example.com/canonical">
    <meta property="og:url" content="https://example.com/page">
    <div class="h-entry">
      <div class="u-author h-card">
        <span class="p-name">Author Name</span>
        <img class="u-photo" src="https://example.com/author.png">
        <a class="u-url" href="https://example.com/author"></a>
      </div>
    </div>
  `;
  
  const result = extractData(html, schema);
  console.log(result);