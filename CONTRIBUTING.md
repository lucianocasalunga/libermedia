# Contributing to LiberMedia

Thanks for your interest in improving LiberMedia! This is the open-source **client**
for the LiberNet ecosystem. Contributions are welcome — bug reports, fixes, and
features.

## Project layout

```
libermedia-spa/   React + TypeScript single-page app (Vite)
wallet-core/      Shared Lightning/Nostr wallet package (@libernet/wallet-core)
```

Keep the two folders side by side — the SPA resolves `@libernet/wallet-core` from the
sibling `wallet-core/` directory.

## Getting started

```bash
cd wallet-core   && npm install
cd ../libermedia-spa && npm install
npm run dev      # dev server
npm run build    # production build (tsc + vite) — must pass before a PR
npm run lint
```

> ⚠️ **The dev server proxies `/api` to the live production backend.** That means
> `npm run dev` talks to real services with real sessions. Be mindful when testing —
> don't spam production, and never point tooling at it in bulk.

## Ground rules for pull requests

- **Never commit secrets.** No `.env`, private keys, `nsec`, seed phrases, tokens,
  passwords, macaroons, or any production credential — ever. Our CI scans for this.
- **No production data** in code, fixtures, tests, or screenshots.
- Run `npm run build` and `npm run lint` locally; a PR that doesn't build won't merge.
- Keep changes focused — one concern per PR.
- Match the surrounding code style; don't reformat unrelated files.
- Be respectful in issues and reviews.

## Reporting security issues

**Do not open a public issue for security problems.** See [SECURITY.md](SECURITY.md)
and email **admin@libernet.app** privately.

## License

By contributing, you agree that your contributions are licensed under the project's
**AGPLv3** license (see [LICENSE](LICENSE)).
