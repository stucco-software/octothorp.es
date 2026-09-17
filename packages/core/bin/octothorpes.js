#!/usr/bin/env node
// #217 — `octothorpes new`: zero-install bootstrap for an OP Client Profile.
//
// BOUNDARY RULE: this bin is the zero-install bootstrap only. It scaffolds a
// stub octothorpes.json and validates it — nothing more. The moment this
// wants prompts, colors, interactive flows, or config discovery, that belongs
// in the separate op-cli repo, not here. Core ships only this bootstrap
// command so a brand-new consumer never needs to hand-author the file from
// scratch; op-cli owns the robust interactive version.
//
// This is the ONLY place in the package that touches fs — it is invoked
// (`npx octothorpes new`), never imported by other core modules.

import { parseArgs } from 'node:util'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { scaffoldProfile } from '../scaffold.js'
import { createProfile } from '../profile.js'

const USAGE = `Usage: octothorpes new [flags]

Scaffolds a stub octothorpes.json (the OP Client Profile) in the current
directory. This is a minimal bootstrap only — for an interactive/robust
authoring experience, use the separate op-cli tool.

Flags:
  --instance=<url>       Canonical base URL of this client (required)
  --name=<text>
  --description=<text>
  --terms=<url>          Terms/vocabulary URI prefix (defaults to <instance>~/)
  --registration=<mode>  registered | open | closed
  --indexing=<mode>      request | active
  --dirs=<path>          Base path for publishers/handlers/harmonizers dirs
  --schema=<path>        Override the $schema value written into the file
  --force                Overwrite an existing octothorpes.json
  --stdout                Print the JSON instead of writing to disk
`

const fail = (message) => {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

const runNew = (argv) => {
  const { values } = parseArgs({
    args: argv,
    options: {
      instance: { type: 'string' },
      name: { type: 'string' },
      description: { type: 'string' },
      terms: { type: 'string' },
      registration: { type: 'string' },
      indexing: { type: 'string' },
      dirs: { type: 'string' },
      schema: { type: 'string' },
      force: { type: 'boolean', default: false },
      stdout: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  })

  if (!values.instance) {
    fail('octothorpes new: --instance is required (e.g. --instance=https://example.test/)')
  }

  const profile = scaffoldProfile({
    instance: values.instance,
    name: values.name,
    description: values.description,
    terms: values.terms,
    registration: values.registration,
    indexing: values.indexing,
    dirs: values.dirs,
  })

  // Validate WITHOUT $schema: the schema has additionalProperties:false at the
  // top level and does not declare $schema as a property.
  const schemaPath = fileURLToPath(new URL('../profile.schema.json', import.meta.url))
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
  try {
    createProfile({ profile, schema })
  } catch (e) {
    fail(`octothorpes new: scaffolded profile failed validation: ${e.message}`)
  }

  const schemaValue = values.schema ?? './node_modules/octothorpes/profile.schema.json'
  const output = { $schema: schemaValue, ...profile }
  const json = `${JSON.stringify(output, null, 2)}\n`

  if (values.stdout) {
    process.stdout.write(json)
    return
  }

  const targetPath = 'octothorpes.json'
  if (existsSync(targetPath) && !values.force) {
    fail(`octothorpes new: ${targetPath} already exists — pass --force to overwrite`)
  }

  writeFileSync(targetPath, json)
  process.stdout.write(`Wrote ${targetPath}\n`)
}

const main = () => {
  const [subcommand, ...rest] = process.argv.slice(2)

  if (subcommand === 'new') {
    runNew(rest)
    return
  }

  process.stderr.write(USAGE)
  process.exit(1)
}

main()
