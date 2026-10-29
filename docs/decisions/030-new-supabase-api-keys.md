# D30. Use Supabase's new API keys: Decided (Claude's call, 2026-10-28)

**Context.** The plan used Supabase's `anon` and `service_role` keys.
Supabase is deprecating both by the end of 2026, two months from now
([API keys](https://supabase.com/docs/guides/api/api-keys)). The
replacements are a **publishable** key (`sb_publishable_…`) and **secret**
keys (`sb_secret_…`).

**Decision.**
- **The app ships only the publishable key** (`VITE_SUPABASE_PUBLISHABLE_KEY`).
  It plays the anon key's role: the public key, limited by the database's
  access rules.
- **Edge Functions use a secret key,** kept only in Supabase's function
  secrets.
- **Every function that acts for a user works out who the caller is**
  from their access token (`auth.getUser(token)`). It never trusts an ID
  in the request body. With the new keys, the platform's JWT check alone
  doesn't prove who the caller is.
- **The shipped-app check** fails the build if it finds `sb_secret_` (and
  the old `service_role`).

**Why.** Building on keys that are about to stop working would mean a
rework right after launch. The security model is unchanged: one public key
limited by the access rules, and secret keys only on the server.

**Changes.** D9's and design §4's "anon key" now means the publishable key.
D28 is unchanged.
