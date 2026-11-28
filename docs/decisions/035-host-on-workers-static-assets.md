# D35. Host the app on Cloudflare Workers static assets, not Pages: Decided (Aamir, 2026-11-27)

**Context.** D20 picked a free static host, "e.g. Cloudflare Pages", and the
plan built the deploy around Pages and its `_headers` file. On the first live
attempt (Task 20), `wrangler pages project create` (Wrangler 4.156) delegated
to Workers instead ("Cloudflare Pages, now part of Cloudflare Workers"),
answered its own confirmation prompt with "yes" in a non-interactive shell,
and failed with nothing created. Cloudflare's Pages overview now says that for
new static sites you should "start with Cloudflare Workers". Pages is not
deprecated and has no end date, but it is no longer the recommended path.

**Decision.**
- Host the built app as a Cloudflare Worker with static assets only (no
  Worker code), served on its `workers.dev` address
  (`<worker-name>.<account-subdomain>.workers.dev`).
- Keep the same `_headers` file and security headers; Workers static assets
  parse it natively, with the same rules and limits as Pages.
- Single-page app routing via `not_found_handling: "single-page-application"`.
- Turn off `workers.dev` preview URLs, so only the current version is
  reachable.
- The Worker config is generated at deploy time into a git-ignored folder, so
  the Worker name and address never enter the public repo (D32).
- The Mac's Wrangler login is limited to `account:read`, `user:read` and
  `workers_scripts:write` (Wrangler adds `offline_access`).
- Every deploy can first run as a dry run (all checks, no upload).

**Why.**
- It's the path Cloudflare supports for new sites, so a future Wrangler update
  is less likely to break deploys.
- Same security headers, still free (static asset requests are free and
  unlimited), still no card.
- The address includes an account-specific part, so it's harder to guess than
  a `pages.dev` name.

**Options ruled out.**
- **Classic Pages via `wrangler pages project create --force`:** works today,
  but builds on the path Cloudflare is moving away from, and the tool already
  redirects Pages commands.
- **GitHub Pages:** no custom response headers, and the address follows from
  the public repo's name (D32).
- **Netlify:** would work, but means another account; Cloudflare is already set
  up with 2FA.

**Changes.** D20's hosting line now reads "Cloudflare Workers static assets".
Task 20's deploy script targets Workers. The `pages:write` login is replaced by
`workers_scripts:write`.
