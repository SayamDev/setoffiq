# Security

SetoffIQ is a static client-side application with no backend, no accounts and no
secrets. That removes whole categories of risk by construction — there is no
session to steal, no database to breach, and no credential to leak.

## Reporting a vulnerability

Open a GitHub issue, or a private security advisory for anything sensitive.
This is a small open-source project, not a service with an on-call rota, so
please describe the issue clearly enough to reproduce.

## Secret management

**There are no secrets in this project.** Every data source is open and keyless,
which is both what keeps it free and the most reliable way to ensure nothing
leaks.

- `.env` and `.env.*` are git-ignored; only `.env.example` is committed.
- `.env.example` contains two commented-out variables, both for the optional
  local model, neither of them a credential.
- No API key, token or password exists anywhere in the repository or the build
  output.
- Because the application is entirely client-side, any secret added in future
  would be visible to every visitor. Nothing should be added that assumes
  otherwise.

## API security

- Every outbound request goes through one client (`src/services/http.ts`) with a
  timeout, an abort signal, bounded retries and exponential backoff. Nothing
  retries indefinitely.
- 4xx responses are never retried.
- Requests are deduplicated and rate-limited per provider.
- Raw provider errors are never shown to users; adapters translate them into
  plain language, so internal details are not exposed.
- Rate limits are respected rather than worked around. SetoffIQ does not rotate
  IPs or accounts, create multiple free accounts, spoof user agents, scrape
  around restrictions or proxy requests to disguise volume.

## Local data

All persistence goes through a single namespaced module
(`src/services/storage.ts`), writing under the `setoffiq:` prefix in
`localStorage`.

- Saved journeys, postcodes, flight numbers, settings and caches never leave the
  device.
- There is no account, no sync and no server-side copy.
- **Clear all local data** in Settings removes everything, which is only
  trustworthy because there is exactly one write path.
- Storage failures (private browsing, blocked origins, quota) degrade to memory
  rather than throwing.

## Third-party data

Responses from external services are treated as untrusted input:

- Every provider response is narrowed through an adapter into a typed domain
  object; provider-specific fields never reach the UI.
- Numeric fields are checked with `typeof` before use, and missing values become
  `null` rather than `undefined` arithmetic.
- Nothing from a provider is rendered as HTML. React escapes all interpolated
  text, and the application contains no `dangerouslySetInnerHTML` anywhere.
- Callsigns and other provider strings are normalised before comparison.

## Input validation

- Postcodes are validated against a UK postcode pattern **before** any request
  is made, so malformed input never reaches the service.
- Dates and times are parsed strictly and rejected if they do not match the
  expected format.
- Flight numbers are normalised (trimmed, uppercased, separators removed) and
  matched against an explicit pattern.
- All user input is rendered as text, never as markup or as part of a URL path
  without normalisation.

## XSS prevention

- React's default escaping is relied on throughout; there is no
  `dangerouslySetInnerHTML`, no `eval`, and no dynamic script construction.
- A Content Security Policy is set in `index.html`:
  - `default-src 'self'`, `script-src 'self'`, `object-src 'none'`
  - `connect-src` is limited to the four data services actually used, plus
    localhost for the optional local model
  - `base-uri 'self'` and `form-action 'none'`
- `style-src` permits `'unsafe-inline'` because a handful of components set
  layout values inline. No user-controlled value is ever used in a style.

## Safe URL handling

- All external links are fixed, hard-coded values; no URL is constructed from
  user input.
- External links carry `rel="noreferrer noopener"`.
- `referrer` policy is `strict-origin-when-cross-origin`.
- Routing is hash-based and matched against a closed set of known routes;
  anything unrecognised falls back to the home screen.

## Dependency management

- The runtime dependencies are React and React DOM. Nothing else ships to the
  browser.
- Everything else is a build or test tool: Vite, TypeScript, Vitest, Testing
  Library, oxlint.
- No dependency is added without a clear need; a smaller tree is a smaller
  attack surface.
- `npm audit` is part of the pre-release check, and CI runs lint, typecheck,
  tests and a production build on every push and pull request.

## Secure headers

GitHub Pages does not allow custom response headers, so only protections that
can be expressed inside the document are available:

- Content Security Policy, as above
- `referrer` policy

**Framing cannot be prevented.** `frame-ancestors` is ignored by browsers when
delivered in a `<meta>` element, and `X-Frame-Options` is a response header that
GitHub Pages will not set — so neither is used, rather than being included for
appearance. The exposure is low: the application has no session, no login and no
privileged action, so there is nothing for a clickjacking attempt to hijack.
Hosting that permits custom headers would close this properly.

The site is served over HTTPS by GitHub Pages.

## Privacy considerations

- No analytics, no advertising, no session recording, no third-party trackers.
- The explanation layer is given a deliberately narrow payload: durations,
  times, windows and a weather description. It never receives an address, a
  postcode, coordinates or a passenger name.
- The optional local model runs on the user's own machine; nothing is sent to a
  hosted model.
- The request counter on the diagnostics page is local to the browser and is
  never transmitted.
