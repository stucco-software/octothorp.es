import { json } from '@sveltejs/kit'

export async function GET({ url }) {
  let entries = [...url.searchParams.entries()]

  // How should this work?

  return json({
    got: entries
  })
}