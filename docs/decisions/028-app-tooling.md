# D28. App tooling and structure: Decided (Claude's call, 2026-10-26)

**Context.** Design §10 left the project structure, state management,
routing, and component library to the builder. The builder has beginner to
intermediate React experience, so prefer conventional, well-documented
tools.

**Decision.**
- **Vite + React + TypeScript**, with **vite-plugin-pwa** for the home-screen
  manifest and service worker.
- **React Router** for the few screens.
- **TanStack Query** for loading and saving data through supabase-js
  (caching, refetching, and loading states without hand-written code).
- **No component library.** Plain CSS with design tokens (CSS variables) in
  one theme file. The look (cream, pastels, grouped rows) is custom anyway.
- **Money is whole cents** (integers) everywhere, in the database and in the
  app. No floating-point dollars.
- **Database types are generated** from the schema (`supabase gen types`), so
  the app and the database can't drift apart silently.
- **The service worker caches only the app's own files,** never bill data. A
  lost or shared phone holds no bill data offline.
- **Hosting: Cloudflare Pages** (free, no card needed), with security headers
  (a strict Content Security Policy, HSTS, and no framing).
- **npm** as the package manager (already installed).

**Options ruled out.**
- **A UI kit (MUI, Chakra):** heavy, and it fights the quiet custom look.
- **Next.js:** a server framework isn't needed for a static app that talks to
  Supabase.
- **Redux:** more ceremony than a handful of screens need.
