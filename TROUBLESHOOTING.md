# Troubleshooting OIDC Logout

This guide covers how to diagnose and fix issues with the OIDC logout flow
("end_session" endpoint, the in-page confirmation dialog, and the
post-logout redirect back to the relying party).

## Architecture overview

The DocPouch OIDC provider has **two** endpoints involved in the logout
confirmation dialog, and the "Yes" and "No" buttons take different paths:

| Button               | Form `formaction`     | Server handler              | Effect on session               |
|----------------------|-----------------------|-----------------------------|---------------------------------|
| "Yes, sign out"      | `/interaction/:uid`   | `NetworkManager.ts:869`     | Session cookies cleared         |
| "No, stay signed in" | `/oidc/cancel-logout` | `NetworkManager.ts:737-744` | Session preserved, `?logout=no` |

The reason "No" bypasses `/interaction/:uid` is that the OIDC provider's
`/end_session.confirm` handler, when reached through the normal
interaction flow, also clears the session cookies regardless of which
button was clicked. Routing "No" to a separate `/oidc/cancel-logout`
endpoint short-circuits that path so the user is redirected back
**without** losing their session.

The "No" path also sets `?logout=no` on the post-logout redirect URL so
the client library's `wasJustLoggedOut()` helper can distinguish a
cancel from a real logout.

---

## Enabling debug logging

```bash
# In your .env file or shell
LOG_LEVEL=debug
```

The logger is configured in `src/srv/main.ts:53`
(`level: process.env.LOG_LEVEL || 'info'`). With `LOG_LEVEL=debug`, the
server will emit the messages listed below.

Restart the server after changing `LOG_LEVEL`.

```bash
LOG_LEVEL=debug npm run run
```

---

## Common issues and solutions

### Issue 1: User is logged out even after clicking "No, stay signed in"

**Symptoms:** Session cookies are destroyed, the user lands on the login
page, and `wasJustLoggedOut()` reports a real logout (not a cancel).

**Debugging steps:**

1. **Enable debug logging** (see above).
2. **Reproduce the flow and watch the server log.** You should see, in order:
    - `=== OIDC Request ===` followed by `GET /oidc/end_session`
    - A request to `POST /oidc/cancel-logout` (the "No" path)
    - `Logout cancelled, redirecting back to app`
    - `Logout cancelled by client, preserving session cookies`
3. **If you see `=== Interaction POST Request ===` instead of the
   `/oidc/cancel-logout` line**, the "No" button is being routed through
   the interaction handler. Check `src/srv/oidc-logout.html:126` — the
   "No" button must have `formaction="/oidc/cancel-logout"`.
4. **If you see no log lines for the cancel at all**, the form is
   not submitting. Check:
    - The form's `action` attribute is `__ACTION_URL__` (rendered to
      `/interaction/:uid`).
    - The "No" button's `formaction` overrides it to `/oidc/cancel-logout`.
    - The hidden `xsrf` and `post_logout_redirect_uri` fields are present.
5. **If you see `Redirecting user to: /`**, the
   `post_logout_redirect_uri` was lost. Check the hidden
   `<input name="post_logout_redirect_uri">` field in the form — it
   must be filled by the template (`__POST_LOGOUT_REDIRECT_URI__`).

### Issue 2: User is redirected to the wrong location

**Symptoms:** After confirming or cancelling logout, the user lands
somewhere unexpected instead of back at the relying party.

**Debugging steps:**

1. **Check the client's `post_logout_redirect_uris` registration.**
   The redirect URL must be in the registered list, otherwise the
   OIDC provider may reject or fall back to a different URI.
2. **Inspect the `post_logout_redirect_uri` query parameter** on the
   initial `GET /oidc/end_session` request in the debug log
   (`=== OIDC Request ===` followed by the query JSON).
3. **Check the hidden form field.** When the form is rendered, the
   `post_logout_redirect_uri` value must be present as a hidden input
   (see `src/srv/oidc-logout.html:123`).
4. **Check the server's log for `logoutRedirect.hit`.** This is the
   request the browser makes when it lands on the post-logout URL and
   contains the full query string, cookies, and referer — useful for
   diagnosing why the redirect target disagrees with the registered URI.

### Issue 3: `wasJustLoggedOut()` returns `true` on every reload

**Symptoms:** The client treats every page load as a logout return and
clears tokens / forces re-login.

**Debugging steps:**

1. **Check the redirect query string.** After a successful logout, the
   user lands on `post_logout_redirect_uri?logout=yes` (or with
   `&logout=yes` if the URL already had a query string). After a cancel,
   it's `?logout=no`. `wasJustLoggedOut()` is sensitive to this value.
2. **Check whether something is stripping the query parameter** in your
   client code before the `wasJustLoggedOut()` check runs. A common
   cause is `vue-router` or similar that normalizes URLs.

### Issue 4: Debug logs are not appearing

**Symptoms:** The server is running with `LOG_LEVEL=debug` but no
debug-level messages show up in the log.

**Solutions:**

1. **Verify the env var is actually set in the running process:**
   ```bash
   echo $LOG_LEVEL  # Should print "debug"
   ```
2. **Confirm the server was restarted after changing `.env`.**
   `process.env.LOG_LEVEL` is read once at startup
   (`src/srv/main.ts:53`).
3. **Check the log file** — debug messages are written via Winston
   to the configured transports. The default is `console` + a log file
   under `log/`.
4. **Verify the logger level isn't being overridden.** Search for
   `logger.level` or `setLogLevel` in `src/srv/`. The only level
   setter is the `process.env.LOG_LEVEL` fallback at `main.ts:53`.

---

## How to reproduce the flow manually

1. **Start the server with debug logging:**
   ```bash
   LOG_LEVEL=debug npm run run
   ```

2. **Register a test OIDC client** (use the demo's `register.js` or
   `curl` directly):
   ```bash
   curl -X POST http://localhost:3030/oidc/reg \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $OIDC_REGISTRATION_TOKEN" \
     -d '{
       "client_name": "Test Client",
       "redirect_uris": ["http://localhost:3030/"],
       "post_logout_redirect_uris": ["http://localhost:3030/"]
     }'
   ```

3. **Log in** by visiting the authorization endpoint with the registered
   `client_id` and `redirect_uri`.

4. **Trigger logout** by visiting:
   ```
   http://localhost:3030/oidc/end_session?post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3030%2F
   ```

5. **Click "No, stay signed in"** and watch the server log. You should
   see the cancel-logout debug messages, the session cookies preserved,
   and the browser lands on `http://localhost:3030/?logout=no`.

---

## Key log messages to look for

All paths are relative to the server's working directory. The actual log
prefix is the Winston format `[<timestamp>] [<level>] - <message>`.

### OIDC request logging (any `/oidc/*` request)

Logged by the middleware in `src/srv/NetworkManager.ts:747-757`:

```
=== OIDC Request ===
GET /oidc/end_session
Query: {"post_logout_redirect_uri":"http://localhost:3030/"}
Headers: {...}
Response sent: 200 for GET /oidc/end_session
```

### "No, stay signed in" path

1. The "No" button submits to `/oidc/cancel-logout` instead of
   `/interaction/:uid`. The form template lives in
   `src/srv/oidc-logout.html:121-129`.

2. The cancel endpoint logs
   (`src/srv/NetworkManager.ts:737-744`):
   ```
   Logout cancelled, redirecting back to app
   ```
   Then redirects 303 to
   `<post_logout_redirect_uri>?logout=no` (or `&logout=no` if a query
   string was already present).

3. The post-logout landing request logs
   (`src/srv/NetworkManager.ts:672-697`):
   ```
   Logout cancelled by client, preserving session cookies
   ```
   followed by a redirect to the same URL with `logout=no` re-appended.

### "Yes, sign out" path

1. The "Yes" button submits to `/interaction/:uid` (the form's default
   `action`). The interaction handler logs
   (`src/srv/NetworkManager.ts:870-875`):
   ```
   === Interaction POST Request ===
   URL: /interaction/<uid>
   Method: POST
   ```
2. For the `logout` prompt, it then logs
   (`src/srv/NetworkManager.ts:932`):
   ```
   User confirmed logout - proceeding with logout
   ```
3. After the OIDC provider finalises, the post-logout landing logs the
   `logoutRedirect.hit` event (`NetworkManager.ts:672-683`) and then
   clears the session cookies before redirecting.

---

## Where to look in the code

| Concern                        | File / line                         |
|--------------------------------|-------------------------------------|
| Cancel-logout endpoint         | `src/srv/NetworkManager.ts:737-744` |
| "No" button formaction         | `src/srv/oidc-logout.html:126`      |
| "Yes" interaction handler      | `src/srv/NetworkManager.ts:869-936` |
| Post-logout redirect handling  | `src/srv/NetworkManager.ts:660-700` |
| OIDC request logger middleware | `src/srv/NetworkManager.ts:747-757` |
| Logger level config            | `src/srv/main.ts:53`                |
| Logout page template           | `src/srv/oidc-logout.html`          |

---

## Debugging checklist

### For "No" cancels

- [ ] Server is running with `LOG_LEVEL=debug`
- [ ] `oidc-logout.html:126` has `formaction="/oidc/cancel-logout"` on the "No" button
- [ ] `oidc-logout.html:123` has a hidden `post_logout_redirect_uri` input
- [ ] `/oidc/cancel-logout` route is registered in `NetworkManager.ts:737`
- [ ] Server log shows `Logout cancelled, redirecting back to app`
- [ ] Server log shows `Logout cancelled by client, preserving session cookies`
- [ ] Browser lands on `post_logout_redirect_uri?logout=no`
- [ ] Client library's `wasJustLoggedOut()` reads `?logout=no` correctly

### For "Yes" confirms

- [ ] Server log shows `=== Interaction POST Request ===` with `Body: { logout: 'yes' }`
- [ ] Server log shows `User confirmed logout - proceeding with logout`
- [ ] Server log shows `logoutRedirect.hit` with `isLogoutCancelled: false`
- [ ] Browser lands on `post_logout_redirect_uri?logout=yes`
- [ ] Session cookies are cleared (verify in browser devtools)

### For wrong redirect target

- [ ] Client's `post_logout_redirect_uris` includes the target URL
- [ ] `=== OIDC Request ===` log shows the correct
  `post_logout_redirect_uri` query parameter
- [ ] `logoutRedirect.hit` log shows the expected `postLogoutRedirectUri`
- [ ] No reverse proxy / CDN is rewriting the `Location` header

---

## When to escalate

If the checklist passes but the bug persists:

1. Save the full server log with `LOG_LEVEL=debug` output.
2. Note the exact browser, OS, and OIDC client used.
3. Include the client registration payload (especially
   `redirect_uris` and `post_logout_redirect_uris`).
4. Capture the browser's Network tab showing the cancel-logout
   request and response headers.
5. Open an issue on the repository with the above attached.