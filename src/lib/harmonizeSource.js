// TODO:
// iterate over unique subjects and output one object per
// add support for type=json
// add support for type=xpath
import { json, error } from '@sveltejs/kit'
import { JSDOM } from 'jsdom'

// import { json } from '@sveltejs/kit'
import { getHarmonizer } from "$lib/getHarmonizer"

// this is copied from getSubjectHTML from index
const DOMParser = new JSDOM().window.DOMParser
const parser = new DOMParser()

const processValue = (value, flag, p) => {
  // regex
  if ( flag === "regex") {
    const regex = new RegExp(p)
    const match = value.match(regex)
      if (match) {
         return match[1] // Use the captured group
      }
      else {
        return null
      }
    }
    if (flag === "substring") {
      // Destructure the start and end points from the params array
      const [start, end] = p;

      // Apply the substring method to each value in the array
      return value.substring(start, end)
  }
}

function filterValues(values, filterResults) {
  console.log('VALUES', values)
  const { method, params } = filterResults;

  switch (method) {
      case "regex":
          const regex = new RegExp(params)
          return values.filter(value => regex.test(value))
      case "contains":
          return values.filter(value => value.includes(params))

      case "exclude":
          return values.filter(value => !value.includes(params))

      case "startsWith":
          return values.filter(value => value.startsWith(params))

      case "endsWith":
          return values.filter(value => value.endsWith(params))

      default:
          console.warn(`Unknown filter method: ${method}`)
          return values
  }
}




// Helper function to extract values based on a schema rule
const extractValues = (html, rule) => {
  if (typeof rule === "string") {
    // If the rule is a string, return it as-is
    return [rule]
  }
  const { selector, attribute, postProcess } = rule
  let tempContainer = parser.parseFromString(html, "text/html")
  const elements = [...tempContainer.querySelectorAll(selector)]
  const values = elements
    .map((element) => {
      let value = element[attribute]
      return value
    })
  return values
}

// Helper function to set a nested property in an object
const setNestedProperty = (obj, keyPath, value) => {
  const keys = keyPath.split(".")
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!current[key]) {
      current[key] = {}
    }
    current = current[key]
  }
  current[keys[keys.length - 1]] = value
}

// helper function use one schema as a base and one as an override
function mergeSchemas(baseSchema, override) {
  // Create a copy of the default schema to avoid modifying the original
  const mergedSchema = { ...baseSchema };

  // Iterate over the keys in the new schema
  for (const key in override) {
      if (override.hasOwnProperty(key)) {
          // If the key exists in both schemas, replace the default with the new value
          mergedSchema[key] = override[key];
      }
  }

  return mergedSchema;
}

// exporting in case anything else is gonna need to grab harmonizers remotely

export async function remoteHarmonizer(url) {
  try {
      // Fetch the remote URL
      const response = await fetch(url);

      // Check if the response is OK (status code 200-299)
      if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
      }

      // Parse the response as JSON
      const data = await response.json();

      // Validate that the JSON has the required properties
      if (!data.title || !data.schema) {
          throw new Error("JSON is missing required properties: 'title' or 'schema'");
      }
      return data
  } catch (error) {
      // Handle any errors (e.g., network issues, invalid JSON, missing properties)
      console.error("Error fetching or validating JSON:", error.message);
      return null; // Return null or handle the error as needed
  }
}

export async function harmonizeSource(html, harmonizer = "default") {

  
    

  let schema = {}
  const d = await getHarmonizer("default")

  if (harmonizer != "default") {
    // TKTK might need other checks if you want to accept a json blob directly
    // but on the other hand, when are you going to get one except from a remote harmonizer? 
      if (harmonizer.startsWith("http")){
          let h = await remoteHarmonizer(harmonizer)
          console.log("remote harmonizer", h.title)

        if (h) {
          schema = mergeSchemas(d.schema, h.schema)
        }
        else {
          throw new Error('Invalid harmonizer structure')
        }
      }
      else {
        let h = await getHarmonizer(harmonizer)
        schema = mergeSchemas(d.schema, h.schema)
      }
    }
  else {
    schema = d.schema
  }

  
  // const schema = harm
  console.log('SCHEEEEEMA')

  let output = {}

  // Process each top-level object in the schema
  let typedOutput = {}
  for (const key in schema) {  
    typedOutput[key] = []
    const s = schema[key].s
    const o = schema[key].o 
    // TKTK think about how to handle multiple sources one day
    const sValues = extractValues(html, s) // Extract all s values

    // Special handling for schema.subject and schema.DocumentRecord
    if (key === "subject" || key === "DocumentRecord") {
      if (key === "subject") {
        // will need a refactor if we want to allow non-source indexing
        // ie from a proactive-indexing standpoint
         // build subjects array ?
        output["@id"] = sValues.toString()
      } else {
        output[key] = {}
      }

      // Process each rule in the "o" array
      o.forEach((rule) => {
        const values = extractValues(html, rule)
        // Use the "key" property to reconstruct the nested structure
        if (rule.key) {
          if (key == "subject") {
            // set source properties on output directly
          setNestedProperty(output, rule.key, values.toString())       
          }
          else {
          setNestedProperty(output[key], rule.key, values)
          }
        } else {
          // If no key is provided, add the values directly
          output[key] = values
        }
      })
    } 
    // end subject/doc record
    else {
      // typedOutput[key] =[]
      // Default handling for other top-level objects
      const oValues = []
      // Process each rule in the "o" array
      o.forEach((rule) => {
        let values = extractValues(html, rule)

        if (rule.filterResults) {
          console.log("filtering")
          values = filterValues(values, rule.filterResults)
        }
        // If the rule has a "key", use it to reconstruct the nested structure. 
        // Unless the API spec changes, this will never run, but since we have it on DocumentRecord, might as well account for it here.
        if (rule.key) {
          setNestedProperty(oValues, rule.key, values)
        } else {
          if (rule.postProcess) {
            let pVals = []
            values.forEach((val) =>{ 
               let pv = processValue(val, rule.postProcess.method, rule.postProcess.params)
               if (pv) {
                pVals.push(pv) 
               }
              values = pVals
            })
            // console.log(rule.postProcess.method)
            // console.log(pVals)
          }
          // Otherwise, add the values directly to the oValues array
          oValues.push(...values)
          typedOutput[key] = oValues
        }
      })
    }
    // end else
  }
  // end process key
  output["octothorpes"] = [
    ...(typedOutput.hashtag || []),
    ...Object.entries(typedOutput)
      .filter(([key, value]) => key !== 'hashtag' && value.length > 0)
      .flatMap(([key, uris]) => 
        uris.map(uri => ({ type: key, uri })) // Map ALL values for each key
      )
  ];
  return output
}

