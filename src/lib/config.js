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
  // Secret: the private page marker the client-endorsed endorsement source looks
  // for (Bear Blog's private marker, on the Bear relay deploy). Unset on deploys that do not name that source in their profile.
  endorsement_marker,
  // Alternative to endorsement_marker: one CSS selector; a page is endorsed when
  // any element matches (not limited to <meta>). Wins over endorsement_marker
  // when both are set.
  endorsement_selector,
} = env;
