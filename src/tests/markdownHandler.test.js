import { describe, it, expect } from 'vitest'
import markdownHandler from '../../packages/core/handlers/markdown/handler.js'
import { createDefaultHandlerRegistry } from '../../packages/core/index.js'

describe('markdown handler — contract', () => {
  it('declares mode and content type', () => {
    expect(markdownHandler.mode).toBe('markdown')
    expect(markdownHandler.contentTypes).toEqual(['text/markdown'])
    expect(typeof markdownHandler.harmonize).toBe('function')
  })

  it('is registered in the default handler registry by mode and content-type', () => {
    const reg = createDefaultHandlerRegistry()
    expect(reg.getHandler('markdown')).toBe(markdownHandler)
    expect(reg.getHandlerForContentType('text/markdown')).toBe(markdownHandler)
  })

  it('returns a blobject with the "source" placeholder @id (identity is assigned by the caller)', async () => {
    const blob = await markdownHandler.harmonize('# Just a heading\n\nbody text')
    expect(blob['@id']).toBe('source')
    expect(Array.isArray(blob.octothorpes)).toBe(true)
  })
})

describe('markdown handler — frontmatter', () => {
  it('maps canonical frontmatter keys to top-level blobject fields', async () => {
    const md = `---
title: My Note
description: A short note
type: article
postDate: 2026-07-08
---

Body content here.`
    const blob = await markdownHandler.harmonize(md)
    expect(blob.title).toBe('My Note')
    expect(blob.description).toBe('A short note')
    expect(blob.type).toBe('article')
    // postDate is passed through as authored (typing/normalization is not this handler's job)
    expect(blob.postDate).toBeTruthy()
  })

  it('routes unknown frontmatter keys to documentRecord (passthrough, untyped)', async () => {
    const md = `---
title: Titled
author: Ada Lovelace
weight: 42
custom:
  nested: true
---

Body.`
    const blob = await markdownHandler.harmonize(md)
    expect(blob.title).toBe('Titled')
    expect(blob.documentRecord).toBeDefined()
    expect(blob.documentRecord.author).toBe('Ada Lovelace')
    expect(blob.documentRecord.weight).toBe(42)
    expect(blob.documentRecord.custom).toEqual({ nested: true })
    // canonical keys are NOT duplicated into documentRecord
    expect(blob.documentRecord.title).toBeUndefined()
  })

  it('maps common date aliases to postDate', async () => {
    const md = `---
title: Dated
date: 2026-01-02
---
body`
    const blob = await markdownHandler.harmonize(md)
    expect(blob.postDate).toBeTruthy()
    // the raw alias key is not leaked into documentRecord
    expect(blob.documentRecord?.date).toBeUndefined()
  })

  it('handles documents with no frontmatter', async () => {
    const blob = await markdownHandler.harmonize('# Heading\n\nno frontmatter at all')
    expect(blob['@id']).toBe('source')
    expect(blob.documentRecord).toBeUndefined()
    expect(blob.title).toBeUndefined()
  })

  it('handles malformed YAML gracefully (no throw, treated as no frontmatter)', async () => {
    const md = `---
title: "unterminated
  : : : not: valid: yaml
---

Body survives.`
    let blob
    expect(async () => { blob = await markdownHandler.harmonize(md) }).not.toThrow()
    blob = await markdownHandler.harmonize(md)
    expect(blob['@id']).toBe('source')
    expect(Array.isArray(blob.octothorpes)).toBe(true)
  })

  it('ignores frontmatter that parses to a non-object (e.g. a bare scalar)', async () => {
    const md = `---
just a string
---
body`
    const blob = await markdownHandler.harmonize(md)
    expect(blob.documentRecord).toBeUndefined()
    expect(blob['@id']).toBe('source')
  })
})
