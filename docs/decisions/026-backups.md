# D26. Where backups go and how they're encrypted: Decided (Claude's call, 2026-10-26)

**Context.** Design §9 asks for a weekly full dump that is encrypted with a
key stored apart from the backup and kept outside Supabase and outside
GitHub, with about 8 weeks kept. It must be free.

**Decision.**
- **Storage: a private Backblaze B2 bucket.** 10 GB free with no card on file.
  A weekly dump is well under 10 MB. A bucket lifecycle rule deletes files
  older than 56 days, so deleted data ages out of backups within 8 weeks.
- **Encryption: `age`**, a small, modern, open-source file encryption tool.
  - The GitHub Action holds only the **public** key, so it can encrypt but
    never decrypt.
  - The **private** key lives only in Aamir's Apple Passwords (and a printed
    copy), never in GitHub, Supabase, or B2.
  - Even if the GitHub secrets leak, the backups stay unreadable.
- **The B2 key is limited to that one bucket**, and can write but not delete
  (the lifecycle rule does the deleting).
- **The dump never touches the Action's logs or artifacts.** The public repo's
  Action logs and artifacts can be seen by others.
- **Restore steps are written down in `docs/operations.md`,** and a restore is
  tested once into the local Supabase.

**Options ruled out.**
- **Cloudflare R2:** a card on file is needed even for the free tier.
- **Google Drive on the sender Gmail account:** OAuth tokens are awkward in
  CI, and it would mix the email sender with the backups.
- **A shared password (symmetric encryption) stored as a GitHub secret:** the
  backup and the key that opens it would both sit in one place, GitHub.
