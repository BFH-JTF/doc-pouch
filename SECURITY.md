# Security Policy

## Reporting a Vulnerability

Do **not** open a public GitHub issue for security problems.

Please report vulnerabilities using GitHub's *private vulnerability reporting*
("Report a vulnerability" on this repository). Reports are only visible to the
maintainers until they are published.

When reporting, include:

- the affected version (or commit) you are running,
- your deployment context (exposed to the internet? user count?),
- a description of the issue and, if possible, a proof of concept,
- any measures an administrator can take in the meantime.

Maintainers will acknowledge reports within 7 days, coordinate a fix, and
publish a GitHub Security Advisory (and a CVE where applicable) together with
the patched release. We will credit reporters by name unless they prefer to
remain anonymous.

## Supported Versions

Only the most recent release is supported with security fixes. Users should
always run the latest release; the admin UI's version check (`/version/check`)
indicates when a newer release is available.

## Security-Relevant Notes for Operators

- Authorization is evaluated against the user record in the database on every
  request — neither JWT claims nor OIDC sessions carry privileges directly.
- Sessions are JWT-based and are not individually revocable. Rotating the JWT
  secret (environment configuration) immediately invalidates all issued
  tokens; force password resets after suspected account compromise.
- Users with `isAdmin: true` (super-admins) can export the complete database,
  including the password hashes of all users. Restrict super-admin accounts
  to the minimum necessary, and audit them regularly.
- Every change of a user's `isAdmin`/`role` privilege is written to the server
  log (including denied attempts), so privilege escalation attempts and changes
  are traceable.