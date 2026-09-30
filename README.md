# SEO Audit & Social Media Preview

A compact Node.js application that audits a public webpage's SEO metadata and renders Open Graph and Twitter Card previews. It demonstrates server-side HTML parsing, defensive outbound HTTP requests, secure rendering, and automated HTTP testing.

## Features

- Checks title, description, canonical URL, H1, language, robots, and viewport metadata.
- Reports completeness of Open Graph and Twitter Card tags.
- Renders website, Facebook, Twitter, and TikTok-style preview cards.
- Lists discovered Open Graph and Twitter metadata for inspection.
- Resolves relative preview URLs against the audited page.
- Returns clear errors for invalid, unreachable, oversized, slow, or non-HTML targets.

## Security and reliability

Because the application fetches user-provided URLs, outbound requests are treated as untrusted:

- Only HTTP and HTTPS URLs without embedded credentials are accepted.
- Local, private, reserved, link-local, and non-public IPv4/IPv6 targets are blocked.
- DNS results and redirect destinations are checked to reduce SSRF risk.
- Requests have a 10-second timeout, five-redirect limit, and 2 MB response limit.
- Non-HTML responses are rejected.
- Metadata and URL attributes are escaped or sanitized before rendering.
- Helmet security headers, a Content Security Policy, and per-IP rate limiting are enabled.

These controls are appropriate for a demonstration project, but a public high-traffic deployment should also enforce limits at its reverse proxy or hosting platform.

## Technology

- Node.js and CommonJS
- Express 5
- Axios
- Cheerio
- Bootstrap 5
- Node's built-in test runner and Supertest

## Requirements

- Node.js 20.18.1 or newer
- pnpm 10.33.0

The repository is pnpm-based. Avoid running npm and pnpm against the same `node_modules` directory.

## Run locally

```bash
corepack enable
pnpm install
pnpm start
```

Open [http://localhost:3001](http://localhost:3001), then enter a complete public URL such as `https://example.com`.

To use another port:

```bash
PORT=4000 pnpm start
```

No database, API key, or environment file is required.

If the application runs behind a reverse proxy, set the number of trusted proxy hops so rate limiting uses the client address safely:

```bash
TRUST_PROXY_HOPS=1 pnpm start
```

## Tests

```bash
pnpm test
```

The test suite covers:

- Private-network and DNS-based SSRF rejection
- IPv4 and IPv6 classification
- URL scheme and credential validation
- HTML and attribute escaping
- Unsafe preview URL removal
- Successful SEO and social metadata rendering
- HTTP security headers, error responses, and rate limiting

## Project structure

```text
.
├── .github/workflows/ci.yml  # Node 20/22 CI checks
├── lib/safe-fetch.js         # URL validation and bounded HTTP fetching
├── test/                     # Unit and HTTP integration tests
├── server.js                 # Express app, metadata parsing, and rendering
├── package.json
└── pnpm-lock.yaml
```

## Deployment

The included `Procfile` starts the application with `node server.js`, and the server honors the hosting platform's `PORT` environment variable. Deploy it to a Node.js host, verify the public URL, and then add that URL to the repository's GitHub **Website** field.

The previous Heroku demo is no longer linked because it currently returns 404.

## Known limitations

- Social previews approximate platform layouts; platforms may apply additional rules and image processing.
- JavaScript-rendered metadata is not executed because the application analyzes the fetched HTML response.
- Public websites may block automated requests or return different metadata based on geography or user agent.

## License

Licensed under the [MIT License](LICENSE).
