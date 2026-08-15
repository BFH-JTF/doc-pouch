# Privacy and Anonymity Guarantees

This document describes what DocPouch does and does not guarantee regarding the
anonymity of submitters when the `ANONYMOUS_DOCUMENTS_ENABLED` environment
variable is set to `true`.

## Threat model

The intended use case is anonymous employee feedback. The submitter is the
adversary's identity to protect; the operator and any other party with access
to the server's disk or log files are **not** assumed to be trusted. The
attacker may read application logs, the OIDC session database, and any
ancillary system logs (reverse proxy, load balancer, OS audit, etc.) and try
to correlate one of those data sources with an anonymous document to
de-anonymize the submitter.

## Per-structure allowlist

Even when `ANONYMOUS_DOCUMENTS_ENABLED` is `true`, anonymous document creation is only permitted for **structures that
an administrator has explicitly flagged**. This is managed through the anonymous-structure allowlist, stored in a
separate NeDB collection (`docpouch-anonymous-structures.db`), **not**
inside the structure documents themselves.

The allowlist is administered through three REST endpoints:

| Endpoint                       | Method | Auth                   | Description                                        |
|--------------------------------|--------|------------------------|----------------------------------------------------|
| `/structures/anonymous/list`   | GET    | Any authenticated user | List all allowed `(type, subType)` pairs           |
| `/structures/anonymous/set`    | POST   | Admin only             | Add a `(type, subType)` pair to the allowlist      |
| `/structures/anonymous/remove` | DELETE | Admin only             | Remove a `(type, subType)` pair from the allowlist |

When a user creates an anonymous document (`anonymous: true`) whose
`type`/`subType` pair is **not** in the allowlist, the request is rejected with HTTP 400 and the error code
`ANONYMOUS_NOT_ALLOWED_FOR_STRUCTURE`.

This two-level gate ensures that administrators must explicitly opt in **both**
globally (`ANONYMOUS_DOCUMENTS_ENABLED=true`) **and** per-structure (allowlist entry) before anonymous submissions are
accepted for a given structure.

## What DocPouch does to protect anonymity

1. **No creator link in the document.** The `owner` field of an anonymous
   document is set to the admin user's id. The submitter's user id is dropped
   on the floor and is not stored anywhere reachable through the document
   itself. The `anonymous` flag is also not persisted, so there is no
   post-hoc way to tell that a document was created anonymously rather than
   by the admin directly.

2. **No creator link in application logs.** With `ANONYMOUS_DOCUMENTS_ENABLED`
   set:
    - The raw request body of an anonymous creation request is not written to
      the log (the body may contain identifying information written by the
      submitter).
    - The `Document created` / `New document created` log line is emitted at
      `debug` level. For anonymous documents, the body of the log entry is
      replaced with a metadata-only summary (`_id`, `type`, `subType`,
      `public`, `shareWithGroup`, `shareWithDepartment`, `owner`). The
      `title`, `description`, and `content` fields are never written to the
      log for anonymous documents.
    - For non-anonymous documents, the same log line is also at `debug`
      level (was previously at `info`).

3. **OIDC session store is in-memory.** With the flag on, the OIDC provider's
   session, access-token, refresh-token, and other NeDB files are
   short-lived in-process maps instead of files in `./db`. There is no
   persisted record of who logged in, when, and from which IP, that an
   attacker with later disk access could correlate with an anonymous
   document.

## What DocPouch does not protect against

1. **Other log sinks.** DocPouch controls its own application logger
   (`./log/general.log`, `./log/error.log`) and the OIDC session store. It
   has no control over:
    - Reverse-proxy / load-balancer access logs (nginx, Caddy, Traefik,
      cloud load balancers, etc.).
    - Operating system audit logs (Linux auditd, Windows event log).
    - Network capture between the client and the server.
    - Database exports performed by an admin (`GET /database/export`).
      Operators running with `ANONYMOUS_DOCUMENTS_ENABLED=true` should review
      the logging configuration of every component in the request path and
      either disable request logging entirely or hash/redact the client IP
      and user identity in those logs.

2. **Identifying content.** DocPouch does not inspect, redact, or warn
   about identifying content that the submitter may include in the
   `title`, `description`, or `content` of an anonymous document. The
   submitter is responsible for not including identifying information if
   they want to remain anonymous.

3. **The database file itself.** While the OIDC store is in-memory with the
   flag on, the application documents database (`./db/docpouch-documents.db`
   by default) is still on disk. An anonymous document lives in that file
   indistinguishable from a regular admin-owned document. An attacker with
   read access to the disk can read the document but cannot tell who
   created it (the data model does not retain that information).

4. **`LOG_LEVEL=debug` for non-anonymous documents.** The redaction
   described above applies only to *anonymous* documents. When
   `LOG_LEVEL=debug` is set globally, non-anonymous document creation
   requests and responses are written to the log in full. Do not run with
   `LOG_LEVEL=debug` while `ANONYMOUS_DOCUMENTS_ENABLED=true` if you also
   expect non-anonymous traffic on the same instance.

5. **Admins who can re-run the server.** An admin with write access to the
   server process and configuration can disable the flag, lower
   `LOG_LEVEL` to `debug`, switch the OIDC store back to a NeDB file, or
   export the entire database. The flag is a privacy-preserving default,
   not a tamper-proof guarantee.

## Operator checklist for `ANONYMOUS_DOCUMENTS_ENABLED=true`

- Set `ANONYMOUS_DOCUMENTS_ENABLED=true` in the server's environment.
- Leave `LOG_LEVEL=info` (or higher) so debug-level redaction is effective
  for non-anonymous traffic.
- Disable or hash/redact request logging in any reverse proxy, load
  balancer, or WAF in front of DocPouch.
- Disable or restrict filesystem access to the `./log` and `./db`
  directories so that the on-disk document database is not readable to
  parties who should not see the content of anonymous feedback.
- If you use OIDC, be aware that the session store is in-memory and
  sessions are lost on restart. Configure short access-token lifetimes
  through the OIDC provider if this matters for your use case.
- Consider periodic rotation of the on-disk OIDC key material in
  `./db/oidc-jwks.json` if you ever temporarily disable the flag and
  re-enable it.
