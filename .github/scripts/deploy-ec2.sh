#!/usr/bin/env bash
set -euo pipefail

revision="${1:?revision is required}"
app_root="${2:?application root is required}"
app_port="${3:?application port is required}"

if [[ ! "$revision" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid Git revision." >&2
  exit 1
fi

case "$app_root" in
  /var/www/*) ;;
  *)
    echo "Application root must be below /var/www." >&2
    exit 1
    ;;
esac

if [[ ! "$app_port" =~ ^[0-9]+$ ]]; then
  echo "Application port must be numeric." >&2
  exit 1
fi

archive="/tmp/pilatesflow-${revision}.tar.gz"
release_dir="${app_root}/releases/${revision}"
current_link="${app_root}/current"
shared_env="${app_root}/shared/.env"

if [[ ! -f "$archive" ]]; then
  echo "Release archive is missing: $archive" >&2
  exit 1
fi

if [[ ! -f "$shared_env" ]]; then
  echo "Runtime environment file is missing: $shared_env" >&2
  exit 1
fi

mkdir -p "$release_dir"
tar -xzf "$archive" -C "$release_dir"
ln -sfn "$shared_env" "$release_dir/server/.env"

(
  cd "$release_dir/server"
  npm ci --omit=dev
)

previous_release="$(readlink "$current_link" 2>/dev/null || true)"
ln -sfn "$release_dir" "$current_link"

rollback() {
  if [[ -n "$previous_release" && -f "$previous_release/ecosystem.config.cjs" ]]; then
    ln -sfn "$previous_release" "$current_link"
    pm2 startOrReload "$previous_release/ecosystem.config.cjs" --env production --update-env || true
  fi
}

if ! pm2 startOrReload "$release_dir/ecosystem.config.cjs" --env production --update-env; then
  rollback
  exit 1
fi

healthy=false
for _ in {1..12}; do
  if curl --fail --silent --show-error "http://127.0.0.1:${app_port}/api/health" >/dev/null; then
    healthy=true
    break
  fi
  sleep 5
done

if [[ "$healthy" != true ]]; then
  echo "Health check failed; restoring the previous release." >&2
  rollback
  exit 1
fi

pm2 save
rm -f "$archive"
echo "EC2 target is healthy on revision $revision."
