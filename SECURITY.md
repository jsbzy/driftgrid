# Security policy

## Reporting a vulnerability

If you find a security issue in DriftGrid — in the open-source code, the hosted service at driftgrid.ai, or the cloud API — please email **jeff@bzydesign.com** instead of opening a public issue.

Include whatever you have:
- a description of the issue
- steps to reproduce
- your assessment of impact
- whether a fix is obvious

We'll acknowledge within **72 hours** and aim to ship a fix (or a mitigation) within **7 days** for P0 issues. We'll keep you in the loop while we work on it.

## Scope

In scope:
- The DriftGrid codebase at [jsbzy/driftgrid](https://github.com/jsbzy/driftgrid)
- driftgrid.ai (landing, auth, cloud sync, share link hosting)
- docs.driftgrid.ai
- The hosted Stripe checkout flow
- Path-traversal, auth bypass, RLS misconfiguration, XSS in rendered share pages, SSRF, prompt injection of the MCP server

Out of scope (report responsibly but not eligible for bounty):
- Social engineering attacks against the Jeff account
- Physical attacks
- Denial of service against the free tier
- Issues in third-party services (Supabase, Stripe, Vercel) that aren't our deployment misuse

## Disclosure

Once a fix ships, we're happy to credit you in the CHANGELOG and on the release notes. Coordinated disclosure — please hold off on public writeups until the fix is live.

## Bounty

No formal program yet. For impactful issues we may offer a one-time payment or a Pro credit — reach out and let's talk.
