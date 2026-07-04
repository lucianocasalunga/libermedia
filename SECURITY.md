# Security Policy

We take the security of LiberMedia and its users seriously. Thank you for helping
keep the project and the people who use it safe.

## Scope

This repository contains the **open-source client** (React SPA + `wallet-core`).
The server-side infrastructure (backend API, relays, media storage, deployment and
all credentials) is operated privately and is **not** part of this repository.

Reports about the client are in scope. If you find something that affects the live
service or the backend, we still want to hear about it — please report it privately
as described below rather than opening a public issue.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately to **admin@libernet.app**. If you can, encrypt sensitive details or
reach us over Nostr for a secure channel.

Please include:

- A clear description of the issue and its impact
- Steps to reproduce (proof-of-concept if possible)
- Affected files/versions

## What to expect

- We aim to acknowledge your report within **72 hours**.
- We will keep you updated on our progress toward a fix.
- We ask that you give us reasonable time to fix the issue before any public
  disclosure (coordinated disclosure).
- With your permission, we're happy to credit you once the issue is resolved.

## Out of scope

- Reports that require physical access to a user's unlocked device
- Missing best-practice headers without a demonstrated, concrete impact
- Findings only reproducible against a heavily outdated fork

## A note on keys

LiberMedia is built on Nostr: **you** own your private key (`nsec`). We never ask
for it and it is never sent to our servers. Never share your `nsec` with anyone —
no legitimate LiberMedia channel will ever request it.
