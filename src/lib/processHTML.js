// TODO:
// iterate over unique subjects

import { getHarmonizer } from "$lib/getHarmonizer";

const h = getHarmonizer(default)
const schema = h.schema 
function extractData(html, schema) {
  const output = {}
  function processValue(value, flag, p) {
    // regex
      if ( flag === "regex") {
        const regex = new RegExp(p);
        const match = value.match(regex);
          if (match) {
             return match[1]; // Use the captured group
          }
          else {
            return null
          }
        }
  }
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
    return value
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
  const typedOutput = {}
  for (const key in schema) {  
    typedOutput[key] = []
    const s = schema[key].s
    const o = schema[key].o 
    // TKTK think about how to handle multiple sources one day
    const sValues = extractValues(html, s); // Extract all s values

    // Special handling for schema.subject and schema.DocumentRecord
    if (key === "subject" || key === "DocumentRecord") {
       if (key === "subject") {
      // will need a refactor if we want to allow non-source indexing
      // ie from a proactive-indexing standpoint
       // build subjects array ?
      output["@id"] = sValues.toString()
       }
      else {
          output[key] = {};
      }

      // Process each rule in the "o" array
      o.forEach((rule) => {
        const values = extractValues(html, rule);
        // Use the "key" property to reconstruct the nested structure
        if (rule.key) {
          if (key == "subject") {
            // set source properties on output directly
          setNestedProperty(output, rule.key, values.toString());       
          }
          else {
          setNestedProperty(output[key], rule.key, values);
          }
        } 
        else {
          // If no key is provided, add the values directly
            output[key] = values;            
          }
      });
    } 
    // end subject/doc record
    
    else {
    // typedOutput[key] =[]  
      // Default handling for other top-level objects
      const oValues = [];
      // Process each rule in the "o" array
      o.forEach((rule) => {
        let values = extractValues(html, rule);
        // If the rule has a "key", use it to reconstruct the nested structure. 
        // Unless the API spec changes, this will never run, but since we have it on DocumentRecord, might as well account for it here.
        if (rule.key) {
          setNestedProperty(oValues, rule.key, values);
        } else {

          if (rule.postprocess) {
            let pVals = []
            values.forEach((val) =>{ 
               let pv = processValue(val, rule.postprocess.method, rule.postprocess.params)
               if (pv) {
                pVals.push(pv) 
               }
              values = pVals
            })
            // console.log(rule.postprocess.method)
            // console.log(pVals)
          }
 

          // Otherwise, add the values directly to the oValues array
          oValues.push(...values);
          typedOutput[key] = oValues

        }
      });
      
    

      // Combine s and o values into pairs
  
      // sValues.flatMap((sVal) =>
      //   oValues.map((oVal) => [key, sVal, oVal])
      // );
      
      // output["ovals"] = oValues
      
    // console.log(typedOutput, "blah")
    }
    // end else
  }
  // console.log(typedOutput)
  // end process key
output["octothorpes"] = [
  ...(typedOutput.hashtag || []),
  ...Object.entries(typedOutput)
    .filter(([key, value]) => key !== 'hashtag' && value.length > 0)
    .map(([key, [uri]]) => ({ type: key, uri }))
]

// console.log(octothorpes);
  return output;
}

const html = `
  <octo-thorpe>webcomponent-1</octo-thorpe>
  <a rel="octo:octothorpes" href="https://example.com/~/TERM-ON-SERVER"></a>
  <octo-thorpe>webcomponent</octo-thorpe>
  <a rel="octo:octothorpes" href="https://backlink-domain.com/"></a>
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