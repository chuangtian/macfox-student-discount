# Shopify app development

This app is scaffolded from a Shopify app template. See the README for framework-specific details.

Use the [Shopify AI Toolkit](https://shopify.dev/docs/apps/build/ai-toolkit) for all Shopify API and platform work. If missing, install it in the agent host per that page (or `npx skills add Shopify/shopify-ai-toolkit --list` for skill-compatible hosts) — do not add tooling to this repo.

## Branch workflow

- Use `local` as the default and canonical working branch for every task and conversation in this repository. Track `origin/local`, not `origin/main`.
- Before making changes, verify the checkout is based on the latest `origin/local`. When the worktree is clean, switch to `local` and update it with a fast-forward-only pull.
- For a detached Codex worktree, verify its starting commit is based on `origin/local`. If it was created from another branch, do not edit files; explain that the task must be recreated with `local` as the starting branch.
- Do not merge, rebase, push, or otherwise target `main` unless the user explicitly requests `main` for that specific task.
