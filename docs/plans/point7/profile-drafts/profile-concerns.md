
==========

New concerns CLAUDE START HERE

`policies.indexing.frequency` -- Re-index cadence under `active`. Inert under `request`. 

This is wrong. it isn't inert under request -- if anything it should be inert under active. the current sveltekit client uses a reindex frequency and it's a request-only client. also should be a number only, should also be able to set 0 for no wait



`api.linkTypes -- Declared first-class link types. Each mints a /get/<path>/<by> route. Undeclared types still work ad-hoc via ?st=`

so.... the public endpoint of the api is actually client configured. what does this meaningfully do in core?

`api.documentRecord[].range` -- why range? why not type?

`api.publishers.named` -- tbh we should kill this for now, deal with it if it comes up

is the way we're extending the octo: vocabulary an RDF sin? what if we namespaced it to the instance?  that also seems complicated.

- I'm thinking about API discoverability. `profile.federation` is reserved -- feels like the best place to declare public API shapes? there should be a default shape based on the living shape

==========

CLAUDE STOP

- if a client wants to override the built-in harmonizers, that's gonna be real hard with them in core. I think this might be the time to fully extract them into flat files, so that core's default set of harmonizers carries the same signature as a custom set (files in /harmonizers)
- bearblog currently uses a custom, hacked together indexing policy flag. before we do the cutover on main, this has to be addressed. I _think_ we can use the existing on-page indexing polic plumbing for that. but that means instead the flag for it being hardcoded, it should be optionally defined in a _NON PUBLIC_ setting. this means making the on-page indexing policy definition dynamic OR just not deploying to Bear and waiting till we work out how to do this with cowsites OR just adding a "custom approval" gate
- schema validation messages should be rewritten by a human
  - tangental -- we don't have comparable schema validation for harmonizers and publishers, do we? would be nice if we did.
- did identity.rules get built?
- review possible performance hits of block/allow lists -- what if we have 5000 urls on the allowlist?
- review / test carefully profile-defined documentRecords
- review status of CLI vs op init to refresh my memory
