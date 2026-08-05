# Pre-commit Secret/ENV Guard (Husky + secretlint)

## What this is

A Husky `pre-commit` git hook that scans staged changes and **blocks the commit** if it finds:
1. An env file being staged (`.env`, `.env.local`, `backend/.env.local`, `.env.production`, etc.)
2. A secret-shaped string in the diff (GitHub token, GitLab token, Slack, OpenAI, Anthropic, Stripe, npm token, private key block, database connection string with password, AWS Secret Access Key, etc.)

Scope for this round is secret/env scanning only — lint/format, tests, and commit-message linting are intentionally out of scope and can be added later as separate steps in `.husky/pre-commit`.

## Files

| File | Purpose |
|---|---|
| `package.json` | `"prepare": "husky"` script (auto-activates the hook on `npm install`) + devDependencies |
| `.husky/pre-commit` | Entry point git actually calls on `git commit` |
| `.lintstagedrc.json` | Tells `lint-staged` to run `secretlint` only on staged files (not the whole repo) |
| `.secretlintrc.json` | Enables `secretlint-rule-preset-recommend` + `secretlint-rule-no-dotenv` |
| `.secretlintignore` | Excludes vendored bundles (e.g. `supabase-js-local.js`) from scanning |

## Flow

```
git commit
   │
   ▼
.husky/pre-commit  (git calls this via core.hooksPath)
   │
   ├─ [1] Check staged file names for .env / .env.*
   │        found      → print the file(s) + exit 1   ❌ commit blocked
   │        not found  → continue to [2]
   │
   └─ [2] npx lint-staged
             → runs secretlint on staged files only
                  secret pattern found (GitHub token, Slack, OpenAI,
                  Stripe, private key, DB connection string, etc.)
                       → exit 1  ❌ commit blocked, staged changes reverted
                  nothing found
                       → exit 0  ✅ commit proceeds normally
```

## What it catches vs. what it doesn't

**Catches:**
- Any staged file named `.env`, `.env.local`, `backend/.env.local`, `.env.production`, etc. — blocked regardless of content (custom guard in `.husky/pre-commit`, not the `no-dotenv` rule — see bugs below)
- Known vendor secret formats via `secretlint-rule-preset-recommend`: GitHub, GitLab, Slack, OpenAI, Anthropic, Stripe, npm tokens, sufficiently long PEM private key blocks, DB connection strings with embedded passwords, AWS Secret Access Key (exact 40-char format)

**Does NOT catch (known gaps, not a complete safety net):**
- **Supabase/JWT-shaped keys** (`eyJ...`) hardcoded directly in `.js`/`.jsx` (not as an `.env` file) — no dedicated secretlint rule exists for this pattern. Attempted a custom local secretlint rule for it; secretlint v13's local-rule path resolution wasn't reliable across machines, so it was removed. This is the concrete residual risk for this repo given the README's explicit warning about the `service_role` key.
- AWS Access Key ID (`AKIA...`) — disabled by default in secretlint (`enableIDScanRule: false`) to avoid false positives
- Generic random secrets with no recognizable vendor prefix — secretlint is pattern/vendor-based, not entropy-based
- `git commit --no-verify` always bypasses the hook — this is a policy nudge, not an unbypassable boundary. Real protection still comes from not committing secrets and rotating any that leak.

## Bugs found and fixed during setup/testing

1. `@secretlint/secretlint-rule-no-dotenv` only matches a file literally named `.env` (checked its source: `fileName === ".env"`), not `.env.local` / `.env.production` — which are this repo's actual env file names. Fixed by adding a direct filename guard in `.husky/pre-commit` instead of relying on that rule alone.
2. Husky runs the hook with `sh -e` (exit-on-error). The filename-guard used `grep`, which exits 1 when it finds no match (the normal case) — under `-e` that killed the hook on **every** commit, not just ones with env files. Fixed with `grep ... || true`.

## Reusing this in another repo (template)

1. Copy these 5 files into the target repo: `.husky/pre-commit`, `.lintstagedrc.json`, `.secretlintrc.json`, `.secretlintignore` (adjust/remove entries for that repo's own vendor files), and merge the `"prepare": "husky"` script + devDependencies into that repo's `package.json` (or use this one as a starting point if it has none).
2. Run:
   ```
   npm install --save-dev husky secretlint @secretlint/secretlint-rule-preset-recommend @secretlint/secretlint-rule-no-dotenv lint-staged
   ```
   This triggers the `prepare` script, which wires up the git hook automatically — no need to re-run `husky init` since `.husky/pre-commit` is already copied over.
3. Verify with the same three test cases used here:
   - A normal commit (no env file, no secret) → should pass
   - Staging an `.env.local`-style file → should be blocked
   - Staging a file containing a known token format (e.g. a fake GitHub token) → should be blocked

## Manual test commands (run from repo root, clean up after)

```bash
# .env-style filename — should be BLOCKED regardless of content
cp backend/.env.example .env.local.test
git add -f .env.local.test && git commit -m "test"
git reset HEAD .env.local.test && rm .env.local.test

# Known secret format — should be BLOCKED
# (build the fake token at runtime so this doc file itself doesn't trip the hook)
echo "GITHUB_TOKEN=ghp_$(printf 'a%.0s' {1..36})" > gh-test.txt
git add gh-test.txt && git commit -m "test"
git reset HEAD gh-test.txt && rm gh-test.txt
```
