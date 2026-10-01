# Repository workflow

- Use pnpm only. Do not run `npm install` against this workspace.
- Use Node.js 20.18.1 or newer.
- Run `pnpm verify` before publishing a pull request.
- Keep raw extracted metadata separate from sanitized or fallback display values when calculating audit results.
- For UI changes, inspect desktop and 390x844 layouts, missing-image behavior, and browser console errors.
- Before reviewing or creating a pull request, fetch the default branch and review the complete `origin/master...HEAD` diff.
- For outbound-fetch changes, verify redirect and DNS SSRF handling, proxy trust, request bounds, and safe public errors.
