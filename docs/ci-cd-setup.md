# PF-29 CI/CD setup

The workflow in `.github/workflows/ci-cd.yml` runs for pull requests, pushes to `main`, and manual dispatches. It installs both projects from their lockfiles, checks backend JavaScript syntax, runs backend tests when a real `server` test script is present, builds the production client, records the current lint baseline, and uploads an immutable release artifact.

Deployment runs only after a push to `main` when the protected GitHub `production` environment has the repository variable `DEPLOY_ENABLED=true`. The tested artifact is copied to exactly two EC2 hosts. Each host installs production server dependencies, changes the PM2 release symlink, verifies `/api/health`, and restores the previous release if startup or health verification fails.

## GitHub configuration

Configure these as GitHub Actions secrets:

- `EC2_HOSTS`: exactly two comma-separated EC2 DNS names or IP addresses.
- `EC2_SSH_USER`: the operating-system account used for deployment.
- `EC2_SSH_PRIVATE_KEY`: the private key for that deployment account.
- `EC2_KNOWN_HOSTS`: trusted SSH host-key lines for both instances. Do not generate these without independently verifying the EC2 host keys.

Configure these as repository or `production` environment variables:

- `DEPLOY_ENABLED`: set to `true` only after both targets and their shared runtime configuration are ready.
- `EC2_APP_ROOT`: optional; defaults to `/var/www/pilatesflow-a2`.
- `APP_PORT`: optional; defaults to `3000` and must match the EC2 `.env` and ALB target port.

Each EC2 instance needs Node.js, npm, PM2 and curl. Create `/var/www/pilatesflow-a2/shared/.env` on each instance with its runtime values. The file must contain `PORT`, `MONGODB_URI`, and `JWT_SECRET` and must never be committed.

The ALB health-check path is `/api/health`. Keep the A1 application in a separate directory and PM2 process so deploying A2 does not replace it.

## Current baseline gaps

At the time PF-29 was started, the backend had no automated-test script. The workflow reports that explicitly and will run `npm test` automatically once feature-test work adds the script. The client also has existing lint errors; lint is visible but temporarily advisory so those pre-existing errors do not prevent the first build artifact. Both gaps must be resolved before final CI evidence is recorded.
