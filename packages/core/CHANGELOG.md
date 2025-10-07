# @consentify/core

## 0.1.0

### Initial Release

**Features:**
- Headless cookie consent SDK with zero dependencies
- Full TypeScript support with strong typing
- SSR-safe implementation (server and client APIs)
- Compact cookie-based storage
- Optional localStorage mirror for fast client reads
- Policy versioning with automatic invalidation
- Support for custom consent categories
- Deterministic policy hashing
- GDPR and CCPA compliance ready

**API:**
- `createConsentify()` - Main factory function
- Server API: `get()`, `set()`, `clear()`
- Client API: `get()`, `set()`, `clear()`
- Default categories: preferences, analytics, marketing, functional, unclassified

**Documentation:**
- Complete API reference
- SSR usage examples
- TypeScript examples
- Custom categories guide

