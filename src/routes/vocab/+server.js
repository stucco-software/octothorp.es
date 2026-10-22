import { redirect } from '@sveltejs/kit'

// #291: /vocab is replaced by the generated /vocabulary document.
export function GET() {
  throw redirect(301, '/vocabulary')
}
