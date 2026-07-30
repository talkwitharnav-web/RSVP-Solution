# Black-Box Security Assessment: RSVP Service

**Target:** `http://192.168.12.140:3001`  
**Assessment date:** 2026-07-29 (local), with HTTP evidence timestamped 2026-07-30 UTC  
**Assessment type:** Unauthenticated black-box web and API assessment  
**Report status:** Final for the completed unauthenticated black-box scope; automated scan coverage was partial  
**Original deployment recommendation:** **BLOCK DEPLOYMENT** until RSVP-001 and RSVP-005 are resolved and retested

**Remediation update (2026-07-29):** RSVP-001 through RSVP-004 and RSVP-006
are fixed and live-retested. Production serves no dev manifests/maps/HMR
markers, TRACE is a small 405, public health is minimal, session responses are
private/no-store, and centralized security headers are present. RSVP-005 is
partially addressed in-app (production requires Secure cookies, emits HSTS,
binds to loopback, and keeps admin localhost-only), but deployment remains
blocked until a real TLS reverse proxy/certificate and HTTP-to-HTTPS boundary
are configured.
The findings below retain the original black-box evidence.

## 1. Executive Summary

The service should not be deployed in its current configuration. The most serious issue is that a Next.js development runtime is exposed to unauthenticated network clients. Public development assets include an application source map containing the complete original contents of 13 source files, 56,937 source characters, absolute local filesystem paths, component names, and internal route names. An outsider can retrieve this information with one unauthenticated HTTP request.

The development runtime also returns a detailed server-side stack trace when sent an unsupported `TRACE` request. The trace identifies Node.js internals, Next.js generated chunks, the local Windows username, the repository name, and the absolute build path. These disclosures materially reduce the effort required to analyze authentication, session, and WebSocket behavior and to develop targeted attacks.

The current listener accepts cleartext HTTP, publishes database health and latency without authentication, omits explicit cache protections on a session-state response, and omits common browser hardening headers. No unauthenticated write method, permissive CORS policy, Host-header redirect, or working unauthenticated WebSocket subscription was found in the tested surface.

No remote-code-execution, SQL-injection, authentication-bypass, or secret-exposure result has been confirmed. That statement is not a clean bill of health: the test had no credentials, no production hostname/TLS endpoint, and no reachable user workflow on this port. Authenticated authorization and business-logic testing remains required.

### Finding Count

| Severity | Confirmed | Conditional / requires authenticated retest |
|---|---:|---:|
| Critical | 0 | 0 |
| High | 1 | 0 |
| Medium | 2 | 1 |
| Low | 2 | 0 |
| Informational | 0 | 0 |

### Highest-Priority Actions

1. Replace the exposed Next.js development server with a clean production build and production runtime.
2. Ensure browser source maps and all development-only manifests, HMR clients, overlays, and stack traces are unavailable.
3. Terminate TLS before exposing the service and prevent direct public access to the cleartext application port.
4. Add generic error handling and reject unsupported methods with a small `405 Method Not Allowed` response.
5. Make session responses explicitly `private, no-store`; reduce the public health endpoint to minimal liveness data.
6. Retest with at least two ordinary accounts and one administrative account before deployment.

## 2. Scope and Rules of Engagement

### In Scope

- One explicitly supplied target: `192.168.12.140:3001`
- HTTP behavior visible to an unauthenticated network client
- Route and technology discovery from public responses
- Public JavaScript, manifests, and source maps
- HTTP methods, CORS, Host handling, response headers, caching, error handling, and WebSocket handshake behavior
- Rate-limited known-vulnerability and exposure templates

### Excluded for Safety

- Denial-of-service, resource-exhaustion, race-condition, and stress testing
- Password guessing, credential stuffing, and account lockout testing
- Destructive data creation, modification, or deletion
- Persistence, reverse shells, malware, or lateral movement
- Social engineering
- Intrusive, fuzzing, brute-force, and DoS-tagged automated templates

### Black-Box Integrity

No local RSVP source file was opened or reviewed during this assessment. Application source content became visible only because the target itself served it in a public `.js.map` response. The local repository path used for this report was likewise learned from that public response.

## 3. Methodology

The assessment combined:

- Manual HTTP request and response inspection with `curl`
- A fixed, low-volume survey of standard web/API metadata paths
- Analysis of public Next.js development assets and source-map metadata
- Safe HTTP method, CORS, Host-header, caching, and security-header checks
- A receive-only unauthenticated WebSocket connection attempt
- Nuclei v3.11.0 with signed template set v10.4.6, rate limiting, and intrusive classes excluded

The automated scan configuration was:

```text
Target:          http://192.168.12.140:3001
Templates:       9,962 signed templates
Severities:      info, low, medium, high, critical
Excluded tags:   dos, fuzz, bruteforce, intrusive
Rate limit:      10 requests/second configured
Concurrency:     5
Timeout:         8 seconds
Retries:         1
```

The automated run was interrupted before completion. Its partial result is recorded in Section 7 for transparency, but it is not used as evidence that untested vulnerabilities are absent.

## 4. Observed Attack Surface

| Resource | Unauthenticated result | Notes |
|---|---:|---|
| `/` | `404` | Plain-text response |
| `/api` | `404` | Next.js development error page; references dev assets |
| `/api/health` | `200` | Detailed DB state and timing |
| `/api/session` | `200` | Returns auth/admin/session state |
| `/api/logout` | `405` on GET; `OPTIONS` advertises POST | Write action not invoked with a real session |
| `/admin/db` | `404` | Name recovered from public source map; not directly routable here |
| `/ws` | `404` over HTTP | WebSocket handshake failed without credentials |
| `/_next/static/development/_buildManifest.js` | `200` | Explicit development manifest |
| `/_next/static/development/_ssgManifest.js` | `200` | Explicit development manifest |
| `/_next/static/chunks/src_1x9_amn._.js.map` | `200` | Embeds original application sources |
| `/openapi.json`, `/swagger`, `/api-docs`, `/graphql` | `404` | No public API schema found |

The public source map exposed these route/path literals:

- `/admin/db`
- `/api/health`
- `/api/logout`
- `/api/session`
- `/ws`

It contained four `fetch(...)` call sites and two WebSocket references. No environment-variable names or hard-coded absolute HTTP/WebSocket URL literals were found in this specific exposed source-map bundle. This does not prove that other bundles or server-only code contain no secrets.

## 5. Findings

## RSVP-001: Next.js Development Runtime and Original Source Code Are Public

**Severity:** High  
**Confidence:** Confirmed  
**Category:** OWASP A05 Security Misconfiguration; CWE-200 Exposure of Sensitive Information  
**Authentication required:** No  
**Deployment blocker:** Yes

### Evidence

A request to the public Next.js error page references development-only resources, including a Turbopack HMR client and Next.js development tools. Development manifests are directly retrievable:

```http
GET /_next/static/development/_buildManifest.js HTTP/1.1
Host: 192.168.12.140:3001
```

Result:

```http
HTTP/1.1 200 OK
Content-Type: application/javascript; charset=UTF-8
```

The response includes a `development` build manifest. More importantly, this source map is public:

```http
GET /_next/static/chunks/src_1x9_amn._.js.map HTTP/1.1
Host: 192.168.12.140:3001
```

Result:

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8
Content-Length observed by client: 91,404 bytes
```

Parsed source-map metadata:

```text
Map sections:                 13
Original source entries:      13
Entries with embedded source: 13
Embedded source characters:   56,937
```

Exposed source paths include components and libraries under:

```text
C:\Users\arnav\Downloads\RSVP\src\components\ui\...
C:\Users\arnav\Downloads\RSVP\src\lib\...
```

The exact local username, repository path, source tree, component names, route names, and full original source contents are therefore available to any client that can reach port 3001.

### Impact

An attacker can reconstruct client-side application logic, identify undocumented API and WebSocket routes, study session behavior, locate trust boundaries, and tailor attacks to implementation details. Absolute filesystem paths reveal host OS and deployment layout. Development runtimes also expose a much larger and less hardened protocol surface than production builds, including HMR and diagnostic handlers.

Worst-case impact depends on what future or route-specific bundles contain. If credentials, tokens, privileged endpoint names, signing assumptions, or vulnerable data flows appear in an exposed source map, this issue becomes a direct stepping stone to account compromise or server-side exploitation. No hard-coded secret was confirmed in the one application map analyzed during this test.

### Root Cause

The externally reachable process is running a Next.js development build (`next dev`, an equivalent custom-server `dev: true` setting, or `NODE_ENV`/startup configuration that selects development mode).

### Remediation

1. Build a clean production artifact with `next build`.
2. Start it with the production command (`next start`) or ensure a custom server initializes Next with `dev: false` in the deployed environment.
3. Set and verify `NODE_ENV=production` at runtime. Do not rely on a developer shell default.
4. Delete the existing `.next` directory before rebuilding so no development artifacts are copied into the deployment image.
5. Keep `productionBrowserSourceMaps` disabled unless there is a documented business need. If maps are uploaded to an error-monitoring service, do not publish them through the web origin.
6. Block `/_next/static/development/*`, HMR endpoints, and `*.map` at the reverse proxy as defense in depth. This is not a substitute for running a production build.
7. Ensure the deployment image excludes source files, `.env*`, Git metadata, local documentation, and development dependencies where practical.
8. Add a CI smoke test that fails if a deployed response contains `buildId":"development`, `hmr-client`, `next-devtools`, or a reachable application `.map` file.
9. Rotate any secret that has ever been embedded in client code or a published source map. Removing the map does not invalidate a value already downloaded.

### Acceptance Criteria

- `/_next/static/development/_buildManifest.js` returns `404`.
- The current application `.js.map` URL returns `404` or is inaccessible to public clients.
- Public HTML/JavaScript contains no Turbopack HMR client or Next devtools reference.
- Triggering an error returns no `buildId: development`, source path, code frame, or stack trace.
- A clean deployment scan cannot recover original `src/...` contents or absolute local paths.

## RSVP-002: Unsupported HTTP Method Leaks a Detailed Server Stack Trace

**Severity:** Medium  
**Confidence:** Confirmed  
**Category:** CWE-209 Generation of Error Message Containing Sensitive Information  
**Authentication required:** No

### Evidence

```http
TRACE /api/health HTTP/1.1
Host: 192.168.12.140:3001
```

Result:

```http
HTTP/1.1 500 Internal Server Error
Response size: 4,783 bytes
```

The HTML response embeds structured development error data containing:

- Error type: `TypeError`
- Error text: `'TRACE' HTTP method is unsupported.`
- A server-side JavaScript stack trace
- Node.js `undici` internal module locations
- Next.js generated chunk names
- The absolute path `C:\Users\arnav\Downloads\RSVP\.next\dev\server\chunks\...`
- Development build metadata

### Impact

The response reveals host, framework, runtime, and filesystem details that speed vulnerability research and targeted exploitation. Other malformed requests may disclose deeper call stacks, code frames, database errors, or values handled near a failing operation.

### Remediation

1. Reject unsupported methods before constructing framework request objects.
2. Return `405 Method Not Allowed` with a precise `Allow` header for known routes.
3. Return a short generic body such as `Method Not Allowed`; never serialize exception objects to clients.
4. Add a top-level production error boundary that logs full details only to a protected server-side sink.
5. Configure the reverse proxy to reject `TRACE` and other unused methods.
6. Resolve RSVP-001; production mode should not expose the Next.js development error renderer.

### Acceptance Criteria

```http
TRACE /api/health HTTP/1.1
```

must produce a small `405` response with no exception name, stack frame, local path, Node.js internal module, generated chunk, or development metadata.

## RSVP-003: Detailed Database Health Information Is Public

**Severity:** Low  
**Confidence:** Confirmed  
**Category:** CWE-200 Exposure of Sensitive Information  
**Authentication required:** No

### Evidence

```http
GET /api/health HTTP/1.1
Host: 192.168.12.140:3001
```

Result:

```json
{
  "tier": "healthy",
  "db": {
    "connected": true,
    "latencyMs": 1,
    "error": null
  },
  "checkedAt": "2026-07-30T00:34:42.723Z"
}
```

The endpoint is reachable without authentication and explicitly exposes database connectivity, query latency, an error field, and a precise server-generated timestamp.

### Impact

An attacker can monitor database availability and latency, correlate maintenance or incidents, identify when a dependent service fails, and tune attack timing. The `error` field is currently null, but it may disclose database hostnames, driver messages, schema names, or query details during a failure unless deliberately sanitized.

### Remediation

1. Split health checks into two endpoints:
   - Public liveness: only a constant response such as `{"status":"ok"}`.
   - Internal readiness/diagnostics: detailed dependency state, accessible only to the orchestrator or an authenticated operations network.
2. Never return raw exception messages or connection strings.
3. Add `Cache-Control: no-store` to health responses.
4. Apply a modest per-client rate limit and monitoring if the endpoint remains externally reachable.
5. Return coarse status, not precise dependency latency, to public clients.

### Acceptance Criteria

The public endpoint reveals no database name, connectivity state, latency, error field, host, query, driver message, or internal dependency identifier. Detailed readiness data is inaccessible from the untrusted network.

## RSVP-004: Session-State Response Lacks Explicit Cache Protection

**Severity:** Medium if authenticated responses are personalized; otherwise Low  
**Confidence:** Header weakness confirmed; authenticated impact requires retest  
**Category:** CWE-525 Use of Web Browser Cache Containing Sensitive Information  
**Authentication required:** No for observation; valid session required to prove data exposure

### Evidence

```http
GET /api/session HTTP/1.1
Host: 192.168.12.140:3001
```

Result:

```http
HTTP/1.1 200 OK
Content-Type: application/json
Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch
```

Observed body:

```json
{"authenticated":false,"admin":false,"sender":null}
```

The response did not include `Cache-Control`, `Pragma`, or `Expires`, and `Vary` did not include `Cookie`. The field names show that this endpoint is designed to return authentication, role, and identity/session state.

### Impact

If an authenticated response contains a sender identity, role, or other user-specific data, an intermediary or browser cache may retain it without an explicit prohibition. A shared reverse proxy or CDN configuration mistake could serve one user's session state to another client. The current unauthenticated response contains no private identity, so cross-user disclosure was not proven in this credential-free test.

### Remediation

Return at least:

```http
Cache-Control: private, no-store, max-age=0, must-revalidate
Pragma: no-cache
Expires: 0
Vary: Cookie
```

If authorization is carried in another header, ensure the cache layer never stores those responses. Prefer bypassing CDN/shared caching entirely for session and identity routes.

### Acceptance Criteria

- Both authenticated and unauthenticated `/api/session` responses include `private, no-store`.
- Shared-cache tests with two distinct users never replay one user's body to another.
- Logging out and using browser Back does not reveal stale identity data.
- `Vary` and reverse-proxy/CDN rules match the actual session transport.

## RSVP-005: Service Accepts Cleartext HTTP Without Transport Enforcement

**Severity:** Medium in the tested LAN; High if exposed with real sessions on an untrusted network  
**Confidence:** Confirmed for HTTP listener  
**Category:** CWE-319 Cleartext Transmission of Sensitive Information  
**Authentication required:** No

### Evidence

All tested endpoints, including session state and logout routing, are reachable over:

```text
http://192.168.12.140:3001
```

No redirect to an HTTPS origin was issued. `Strict-Transport-Security` was absent, as expected on the cleartext listener.

### Impact

On a shared or hostile network, an adjacent attacker can observe or modify requests and responses, steal session cookies that are not independently protected, inject client code, or alter health/session decisions. HSTS cannot protect direct HTTP use until HTTPS is correctly deployed and the browser has received the policy over a trusted TLS connection.

### Remediation

1. Terminate TLS at a hardened reverse proxy or load balancer using a valid certificate.
2. Redirect the public HTTP origin to HTTPS, or do not expose the application HTTP port outside a private container/network boundary.
3. Mark every authentication/session cookie `Secure`, `HttpOnly`, and with an appropriate `SameSite` value.
4. Trust forwarded protocol headers only from known proxies; do not trust arbitrary client-supplied `X-Forwarded-Proto`.
5. After HTTPS is stable, send an HSTS policy such as `max-age=31536000; includeSubDomains`; evaluate `preload` separately before enabling it.
6. Encrypt any service-to-service hop that crosses an untrusted network.

### Acceptance Criteria

- Public HTTP requests redirect to the canonical HTTPS URL or cannot reach the application listener.
- TLS uses a valid certificate and currently supported protocol/cipher configuration.
- Session cookies are never sent over cleartext transport.
- HTTPS responses include the approved HSTS policy.

## RSVP-006: Browser Hardening Headers Are Missing and Framework Is Disclosed

**Severity:** Low  
**Confidence:** Confirmed on tested responses  
**Category:** OWASP A05 Security Misconfiguration / defense in depth  
**Authentication required:** No

### Evidence

The tested Next.js HTML response and API responses did not include:

- `Content-Security-Policy`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`
- `X-Frame-Options` or a CSP `frame-ancestors` directive
- `Cross-Origin-Resource-Policy`
- `Strict-Transport-Security`

The HTML error response included:

```http
X-Powered-By: Next.js
```

### Impact

Missing headers do not independently prove an exploit, but they remove containment layers for content injection, clickjacking, MIME confusion, referrer leakage, and unnecessary browser capabilities. Framework disclosure marginally improves attacker fingerprinting. The practical CSP and framing impact must be retested on a reachable real application page, not only an error page.

### Remediation

1. Disable the Next.js powered-by header with `poweredByHeader: false`.
2. Define a production CSP tailored to actual scripts, styles, images, connections, frames, and third-party services. Start with report-only monitoring if needed, then enforce it.
3. Include at minimum:
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy` disabling browser capabilities the app does not use
   - CSP `frame-ancestors 'none'` or an explicit trusted framing list
   - CSP `object-src 'none'` and `base-uri 'self'`
4. Add `Cross-Origin-Resource-Policy` where compatible with intended asset sharing.
5. Set headers centrally at the reverse proxy or Next.js configuration, then override only where necessary.
6. Add HSTS only after RSVP-005 is resolved.

### Acceptance Criteria

- All HTML routes receive the approved CSP, referrer, permissions, MIME, and framing policies.
- API and static responses receive appropriate MIME and cache protections.
- `X-Powered-By` is absent.
- Browser console and CSP reporting show no unintended violations during core workflows.

## 6. Defensive Checks That Passed

The following checks did not produce a confirmed vulnerability in this unauthenticated assessment:

### HTTP Method Restrictions

| Route | Result |
|---|---|
| `/api/health` GET | `200` |
| `/api/health` OPTIONS | `204`; `Allow: GET, HEAD, OPTIONS` |
| `/api/health` POST | `405` |
| `/api/health` PUT | `405` |
| `/api/health` PATCH | `405` |
| `/api/health` DELETE | `405` |
| `/api/logout` GET | `405` |
| `/api/logout` OPTIONS | `204`; `Allow: OPTIONS, POST` |

`TRACE` is the exception and is documented in RSVP-002.

### CORS

Requests with `Origin: https://attacker.example` received no `Access-Control-Allow-Origin`. A hostile-origin preflight did not authorize `POST` or the requested `authorization` header. No permissive or reflected CORS policy was observed.

### Host and Forwarding Headers

Supplying `Host: attacker.example`, `X-Forwarded-Host: attacker.example`, or `Forwarded: host=attacker.example` did not produce an attacker-controlled absolute redirect. The tested canonicalization response used a relative `Location` value.

### WebSocket

An unauthenticated connection attempt to `ws://192.168.12.140:3001/ws` failed. No outsider subscription or message disclosure was demonstrated. This must be retested using the production hostname and intended authenticated workflow because the public source map proves WebSocket-related client code exists.

### Public Metadata Paths

No public OpenAPI, Swagger, GraphQL, sitemap, robots, or security.txt document was found at the standard paths tested. The absence of documentation is not itself a security control.

## 7. Automated Scan Results

**Status:** Stopped before completion; retained as partial supplemental coverage only.

Nuclei v3.11.0 loaded 9,962 signed templates from template set v10.4.6 and planned 16,459 HTTP requests after clustering. Intrusive, fuzzing, brute-force, and denial-of-service templates were excluded. The latest recorded checkpoint reached 8,973 of 16,459 planned requests (54%), with zero template matches and 24 request/template errors. The run then stopped and was not resumed at the user's request.

This partial zero-match result must not be interpreted as a completed vulnerability scan or as evidence that the remaining templates would not match. It does not alter the six manually established findings, and it does not cover custom business logic, authenticated authorization boundaries, vulnerabilities requiring valid request shapes, production TLS/proxy behavior, or the templates that were not reached.

Before release, run a fresh complete scan against the production-like deployment after remediation. Record the exact tool and template versions, start and end times, final request/error/match totals, and manually validate every high- or critical-severity match before treating the result as a release gate.

## 8. Untested or Incompletely Tested Risk Areas

These areas require a second assessment with a production-like URL and test accounts:

1. Authentication flow, password policy, reset flow, account enumeration, MFA, and lockout behavior.
2. Session cookie flags, rotation at login/privilege change, invalidation at logout, fixation, idle timeout, and absolute timeout.
3. Horizontal and vertical authorization using at least two ordinary users and one administrator.
4. IDOR/BOLA on event, invitation, RSVP, sender, card, template, and administrative identifiers.
5. Stored and reflected XSS in guest names, invitation content, themes, card fields, and administrative views.
6. SQL/NoSQL injection in real parameterized endpoints and authenticated forms.
7. CSRF on every state-changing action, including logout, administrative changes, invitation sending, and RSVP updates.
8. File upload validation, object storage access control, image processing, and metadata handling, if uploads exist.
9. SSRF in image fetching, preview generation, webhook, import, or URL metadata features.
10. Email/header injection and abuse controls in invitation or notification workflows.
11. WebSocket origin validation, authentication, authorization per message, replay, schema validation, and rate limits.
12. Rate limiting for login, invitation sending, health checks, mutations, and expensive searches.
13. Production dependency versions and lockfile vulnerabilities. Exact package versions were not established by black-box evidence.
14. Database least privilege, secret management, backup exposure, and network segmentation.
15. Multi-tenant isolation and administrative audit logging.
16. TLS certificate, protocol, cipher, redirect, cookie, and HSTS behavior on the final hostname.
17. Request smuggling and proxy desynchronization across the actual production reverse-proxy chain.
18. Availability and resource limits under controlled load. Deliberately excluded from this assessment.

## 9. Remediation Plan

### P0: Before Any Deployment

- Run a clean production Next.js build and eliminate all development/HMR/source-map exposure.
- Put the application behind TLS and prevent direct public access to port 3001.
- Verify no source, `.env`, Git metadata, development docs, or debug artifacts are included in the runtime image.
- Update Next.js, React, Node.js, and directly exposed server dependencies to supported patched releases.
- Retest public development paths and known critical Next.js/React server-component vulnerabilities.

### P1: Before Release Candidate Approval

- Replace verbose errors with generic production responses and a strict method allowlist.
- Reduce public health data and protect detailed readiness diagnostics.
- Add `private, no-store` handling to session and identity responses.
- Establish centralized browser security headers and remove framework banners.
- Verify secure session cookies, rotation, logout invalidation, and CSRF protections with real accounts.

### P2: Before General Availability

- Complete authenticated multi-role authorization and business-logic testing.
- Test all input-bearing endpoints for injection, XSS, SSRF, upload, and email abuse.
- Validate WebSocket origin/authz/message controls.
- Verify rate limits, logging, alerting, audit trails, backups, and dependency scanning.
- Run a controlled production-architecture scan through the actual CDN/WAF/reverse proxy, not directly against the development listener.

## 10. Retest Checklist

Use this as the minimum release gate:

- [ ] Target no longer exposes any `development` build manifest.
- [ ] HMR and Next devtools assets are absent.
- [ ] Application `.js.map` requests fail for unauthenticated clients.
- [ ] No response contains an absolute local path or source code.
- [ ] Unsupported methods return generic `405` responses.
- [ ] Public health output is minimal and contains no dependency details.
- [ ] Session responses are `private, no-store` for authenticated and unauthenticated clients.
- [ ] HTTPS is mandatory and session cookies are `Secure`, `HttpOnly`, and appropriately `SameSite`.
- [ ] Approved CSP, MIME, referrer, permissions, and framing policies are present.
- [ ] `X-Powered-By` is absent.
- [ ] CORS remains restricted to intended origins and methods.
- [ ] Host and forwarded headers are validated by the production proxy.
- [ ] Two-user horizontal authorization tests pass.
- [ ] Ordinary-user-to-admin vertical authorization tests pass.
- [ ] WebSocket authentication, Origin validation, and per-message authorization pass.
- [ ] A final known-CVE scan reports no applicable high/critical result.
- [ ] Dependency and container scans report no unresolved release-blocking vulnerability.

## 11. Reproduction Commands

Run only against the authorized test target.

### Confirm Development Manifest

```powershell
curl.exe -i http://192.168.12.140:3001/_next/static/development/_buildManifest.js
```

### Confirm Public Source Map

```powershell
curl.exe -i http://192.168.12.140:3001/_next/static/chunks/src_1x9_amn._.js.map
```

### Confirm Stack-Trace Disclosure

```powershell
curl.exe -i -X TRACE http://192.168.12.140:3001/api/health
```

### Confirm Health Disclosure

```powershell
curl.exe -i http://192.168.12.140:3001/api/health
```

### Confirm Session Cache Headers

```powershell
curl.exe -i http://192.168.12.140:3001/api/session
```

### Confirm CORS Remains Restricted

```powershell
curl.exe -i `
  -H "Origin: https://attacker.example" `
  http://192.168.12.140:3001/api/session
```

## 12. Interpretation Notes

- “Confirmed” means the behavior was reproduced directly from the network target.
- “Conditional” means a control weakness is visible, but demonstrating user impact requires credentials or the production proxy/TLS path.
- A `404` on a guessed route does not prove that the feature is absent; it proves only that the tested unauthenticated request did not reach it at that path.
- A zero-match automated scan does not prove the absence of vulnerabilities.
- This report intentionally avoids claiming destructive worst-case impact that was not demonstrated.
