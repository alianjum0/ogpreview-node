# MetaScope — SEO Audit & Social Preview

A compact Node.js application that audits a public webpage or pasted HTML, explains deterministic SEO and social metadata findings, and lets you edit metadata against live previews before copying generated tags. It demonstrates server-side HTML parsing, defensive outbound HTTP requests, secure rendering, and automated HTTP testing.

## Features

- Accepts a public URL or pasted HTML for localhost, staging, and bot-blocked pages.
- Scores transparent SEO, indexability, Open Graph, and Twitter/X rules from 0–100.
- Renders search, Facebook, X/Twitter, LinkedIn, Slack, and WhatsApp-style preview cards.
- Validates social-image reachability, type, bytes, dimensions, and aspect ratio.
- Edits draft metadata with instant preview updates and generated `<head>` tags.
- Exposes the same URL analyzer through a versioned JSON response.
- Copies shareable audit links and exports JSON or Markdown reports without storage.
- Audits up to 10 same-origin sitemap pages for scores, failures, and duplicate metadata.
- Validates JSON-LD syntax and reports detected Schema.org-style `@type` values.
- Lists discovered Open Graph and Twitter metadata for inspection.
- Resolves relative preview URLs against the audited page.
- Returns clear errors for invalid, unreachable, oversized, slow, or non-HTML targets.

## Security and reliability

Because the application fetches user-provided URLs, outbound requests are treated as untrusted:

- Only HTTP and HTTPS URLs without embedded credentials are accepted.
- Local, private, reserved, link-local, and non-public IPv4/IPv6 targets are blocked.
- DNS results and redirect destinations are checked to reduce SSRF risk.
- Page requests have a 10-second timeout, five-redirect limit, and 2 MB response limit.
- Image requests reuse the SSRF boundary with a 7-second timeout and 5 MB limit.
- Preview images are loaded through a bounded same-origin route instead of directly from metadata-controlled hosts.
- Pasted HTML is processed in memory and capped at 256 KB.
- Sitemaps use the same SSRF-safe 2 MB fetch boundary and may include up to three same-origin child sitemaps.
- Site audits fetch at most 10 same-origin pages with three concurrent requests.
- Non-HTML responses are rejected.
- Metadata and URL attributes are escaped or sanitized before rendering.
- Helmet security headers, a Content Security Policy, and per-IP rate limiting are enabled.

These controls are appropriate for a demonstration project, but a public high-traffic deployment should also enforce limits at its reverse proxy or hosting platform.

## Technology

- Node.js and CommonJS
- Express 5
- Axios
- Cheerio
- image-size
- Responsive, dependency-free CSS
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

Open [http://localhost:3001](http://localhost:3001), then enter a complete public URL such as `https://example.com` or switch to **HTML** and paste page markup. Supply a public base URL in HTML mode when relative canonical or image URLs need to be resolved.

To use another port:

```bash
PORT=4000 pnpm start
```

No database, API key, or environment file is required.

## API and report exports

Analyze a public page as JSON:

```http
GET /api/analyze?url=https%3A%2F%2Fexample.com
```

The response contains `schemaVersion`, the analyzed URL and source details, the score summary, normalized metadata, deterministic checks, and image-inspection results. API failures return a JSON `error` without exposing unexpected upstream details.

Download the same URL audit as Markdown:

```http
GET /report.md?url=https%3A%2F%2Fexample.com
```

URL results also include controls to copy the reproducible audit URL, open the JSON export, or download the Markdown report. Pasted HTML stays local to the request and therefore does not expose share/export controls.

Audit a sitemap through the UI at `/site?url=...` or as JSON:

```http
GET /api/site?url=https%3A%2F%2Fexample.com%2Fsitemap.xml
```

The site response includes discovery limits, success/failure totals, average score, duplicate titles/descriptions/canonicals, structured-data summaries, and page-level checks. Sitemap indexes are followed one level deep, with at most three same-origin child sitemaps.

If the application runs behind a reverse proxy, set the number of trusted proxy hops so rate limiting uses the client address safely:

```bash
TRUST_PROXY_HOPS=1 pnpm start
```

## Tests

```bash
pnpm test
```

Before publishing a pull request, run the same syntax, test, and production dependency checks used by CI:

```bash
pnpm verify
```

The test suite covers:

- Private-network and DNS-based SSRF rejection
- IPv4 and IPv6 classification
- URL scheme and credential validation
- HTML and attribute escaping
- Unsafe preview URL removal
- Successful SEO and social metadata rendering
- Slack and WhatsApp preview rendering
- URL and pasted-HTML analysis modes
- Stable JSON analysis and Markdown report exports
- Bounded sitemap parsing, aggregation, and same-origin enforcement
- JSON-LD syntax and `@type` summaries
- Deterministic audit rules and scoring
- Bounded social-image inspection and safe same-origin previews
- Generated metadata-tag escaping and unsafe URL omission
- HTTP security headers, error responses, and rate limiting

## Project structure

```text
.
├── .github/workflows/ci.yml  # Node 20/22 CI checks
├── lib/
│   ├── analyze.js            # Shared analysis pipeline
│   ├── audit.js              # Deterministic rules and scoring
│   ├── image-inspector.js    # Bounded social-image validation
│   ├── metadata.js           # Normalized metadata parsing
│   ├── report.js             # Public JSON and Markdown serializers
│   ├── safe-fetch.js         # URL validation and bounded page fetching
│   └── site-audit.js         # Bounded sitemap and cross-page analysis
├── public/
│   ├── app.js                # Input tabs and live draft previews
│   ├── tag-generator.js      # Shared browser/server tag generation
│   └── styles.css
├── test/                     # Unit and HTTP integration tests
├── server.js                 # Express routes and server rendering
├── package.json
└── pnpm-lock.yaml
```

## Deployment

The included `Procfile` starts the application with `node server.js`, and the server honors the hosting platform's `PORT` environment variable. Deploy it to a Node.js host, verify the public URL, and then add that URL to the repository's GitHub **Website** field.

The previous Heroku demo is no longer linked because it currently returns 404.

## Known limitations

- Social previews approximate platform layouts; platforms may apply additional rules and image processing.
- The numerical score is a transparent MetaScope rules score, not a search-engine ranking prediction.
- JavaScript-rendered metadata is not executed because the application analyzes the fetched HTML response.
- Public websites may block automated requests or return different metadata based on geography or user agent.
- Draft edits update previews and generated tags but do not recalculate the source-page audit.
- Share links and exports rerun the live URL analysis; results can change when the target page changes.
- Site audits intentionally stop after 10 pages and one sitemap-index level; they are not a general-purpose crawler.
- Structured-data checks validate JSON-LD syntax and declared types, not full Schema.org vocabulary requirements.

## License

Licensed under the [MIT License](LICENSE).
