import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/xoxo2024.html')
}