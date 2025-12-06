# @consentify/core

## 1.0.0

### 🎉 Stable Release

**Core Features:**

- Headless cookie consent SDK with zero dependencies
- Full TypeScript support with strong typing
- SSR-safe implementation (server and client APIs)
- Compact cookie-based storage with optional localStorage mirror
- Policy versioning with automatic snapshot invalidation
- Support for custom consent categories
- Deterministic policy hashing
- GDPR and CCPA compliance ready

**React Integration:**

- `subscribe()` method for `useSyncExternalStore` integration
- `getServerSnapshot()` for SSR hydration support
- Internal state caching for optimal React performance
- Subscriber notification system for reactive updates

**API:**

- `createConsentify()` — Main factory function
- Server API: `get()`, `set()`, `clear()`
- Client API: `get()`, `set()`, `clear()`, `subscribe()`, `getServerSnapshot()`
- Default categories: preferences, analytics, marketing, functional, unclassified

## 0.1.0

### Initial Release

- Initial beta release with core functionality
