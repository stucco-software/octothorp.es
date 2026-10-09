// Runtime config. Re-exports every env var the app uses from $env/dynamic/private
// so values are read from process.env at RUNTIME (required for Docker/Railway,
// where the image is built once and run with per-service variables). Do NOT
// switch this back to $env/static/private — that bakes values in at build time.
import { env } from '$env/dynamic/private';

export const {
  sparql_endpoint,
  sparql_user,
  sparql_password,
  instance,
  smtp_host,
  smtp_port,
  smtp_secure,
  smtp_user,
  smtp_password,
  robot_email,
  // Secret: what the client-endorsed endorsement source looks for in a page.
  // A plain string matches a <meta> whose content equals it; a JSON object
  // with a `type` is a rule, e.g. {"type":"selector","selector":"<css>"}.
  // Unset on deploys that do not name that source in their profile.
  secret_knock,
  // Secret: Bearer token / form secret for /admin (approve, ban, unban).
  // Env-only, never in octothorpes.json. Unset disables every admin surface (503).
  admin_secret,
} = env;
