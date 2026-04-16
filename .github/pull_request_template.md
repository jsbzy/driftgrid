<!--
Thanks for the PR! A quick checklist to keep reviews moving.
-->

## What changes

<!-- Describe what this PR does and why. Link related issue(s). -->

Closes #

## Checklist

- [ ] Manually tested the affected flow
- [ ] `npx tsc --noEmit` passes
- [ ] No new `any`, `@ts-ignore`, or silent `.catch(() => {})` in hot paths
- [ ] DB changes include a migration in `supabase/migrations/`
- [ ] New user input is validated (slugs, enums, etc.)
- [ ] Docs updated if behavior or config changes (README, docs.driftgrid.ai)

## Screenshots / demo

<!-- Before/after screenshots for UI changes, or a short clip. -->
