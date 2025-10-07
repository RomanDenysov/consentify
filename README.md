## consentify monorepo

Packages:
- `@consentify/core`: Headless cookie consent SDK (TS-first, SSR-safe)
- Future: `@consentify/react`, `@consentify/next`

Development:
- Build all: `pnpm -r build`
- Build core only: `pnpm -w --filter @consentify/core build`

Publishing:
- CI publishes on tags matching `core-v*`. Ensure `NPM_TOKEN` is set in GitHub secrets.

License: MIT
