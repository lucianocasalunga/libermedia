# LiberMedia

A social media client for real people, built on **Nostr** and the **Bitcoin Lightning
Network**. No central server that can be shut down, censored, or sold — no secret
algorithm, no ad-tech tracking. An open, resilient network with the smoothness of a
commercial app.

**Live (Beta):** https://media.libernet.app · **Pitch & metrics:** https://media.libernet.app/pitch

> 🇧🇷 Feito no Brasil, para o mundo. Cliente Nostr de código aberto — o *Twitter do Nostr*,
> com pagamentos Lightning nativos.

---

## What it is

LiberMedia is the **client** for the LiberNet ecosystem: a full social app running on the
open Nostr protocol, designed so that a normal person — not a developer — can actually use
it. Feed, profiles, encrypted messaging, reels, native Lightning payments (ZAPs), paid
content, and Web-of-Trust moderation.

This repository contains the **open-source client**:

- `libermedia-spa/` — the React + TypeScript single-page application.
- `wallet-core/` — the shared Lightning/Nostr wallet package (`@libernet/wallet-core`).

The server-side infrastructure (backend API, relays, media, deployment and all secrets)
is operated privately and is **not** part of this repository — as with any open-source
service, the *code* is free; production credentials and access data are not.

## Features

- 📰 Nostr feed with threads, reactions, reposts and media
- 💬 End-to-end encrypted direct messages (NIP-17/NIP-44)
- ⚡ Native Lightning ZAPs and paid content
- 🎬 Reels / short video
- 🔐 Key-pair identity (npub/nsec) — you own your account, not us
- 🛡️ Web-of-Trust collaborative moderation
- 📱 PWA + Android (TWA)

## Tech stack

React 19 · TypeScript · Vite · TailwindCSS · Jotai · `nostr-tools` · `@noble/*`

## Getting started

```bash
# from the repo root
cd libermedia-spa
npm install
npm run dev        # dev server on http://localhost:5173/v2.5/
                   # (API calls are proxied to the live backend)
npm run build      # production build
```

The SPA resolves `@libernet/wallet-core` from the sibling `wallet-core/` directory, so keep
the two folders side by side.

## License

Licensed under the **GNU Affero General Public License v3.0** (AGPLv3) — see [LICENSE](LICENSE).

AGPLv3 means: you're free to use, study, modify and share this code, but if you run a
modified version as a network service, you must make your changes available under the same
license. Freedom that stays free.

## About

Built by **Luciano "Barak" Casalunga** and an AI-driven team — part of a 20+ year line of
open-source work, from Linux distros to the decentralized web. LiberMedia is proof that the
open internet can feel as good as the walled gardens it replaces.

Nostr · Bitcoin · Freedom.
