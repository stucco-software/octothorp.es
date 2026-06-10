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
  default_handler,
  server_name,
  admin_email,
  badge_image,
  smtp_host,
  smtp_port,
  smtp_secure,
  smtp_user,
  smtp_password,
  robot_email,
} = env;
