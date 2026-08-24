# Farmenta · Web

Frontend for Farmenta — borrow USDG against Uniswap v4 LP position NFTs on Robinhood Chain (4663). Spec: [farmenta-defi/docs](https://github.com/farmenta-defi/docs).

## Stack
- Next.js 16 (App Router, TypeScript, Turbopack) · pnpm
- wagmi **v2** + viem 2 + RainbowKit 2 (wagmi is pinned to v2 because RainbowKit 2.2.x peer-requires it; upgrade to wagmi 3 when RainbowKit supports it)
- Tailwind CSS v4 + shadcn/ui (base-nova preset), dark-first
- TanStack Query (via wagmi)

## Develop
```bash
pnpm install
cp .env.example .env.local   # optional: fill WalletConnect id + RPC override
pnpm dev
```

## Structure
- `src/lib/wagmi.ts` — chain (viem `robinhood`), transports, RainbowKit config
- `src/lib/contracts.ts` — verified contract addresses + minimal ABIs
- `src/app/{lend,borrow,portfolio,liquidations,risk}` — pages (stubs until the FarmentaMarket contracts are deployed; `risk` already shows the v0.2 parameters)
- `src/components/` — navbar, live stats, shadcn/ui components

## Landing hero
`/` is a full-screen, no-scroll hero adapted from a motionsites.ai spec (LŪMEN // ÍNDEX theme): black + ice-blue `#AFDDFF`, animated grid, node diagram, staggered entrance. Notes:
- The background video is an **external motionsites CloudFront asset** (not ours; may disappear) — replace with an owned asset before launch.
- Display font is **Archivo** via `next/font` as a license-safe stand-in for Graphik LCG; UI font is Manrope.
- Nav + wallet strip are functional: real routes, real wagmi state (`ConnectButton.Custom`), chip shows GUEST_MODE / WRONG_NETWORK / ROBINHOOD_CHAIN.
- App pages live in the `(app)` route group (own navbar/footer); the hero page has neither.

## Notes
- Live on-chain reads (PositionManager `nextTokenId`, `balanceOf`) already work against mainnet — proof the wiring is correct.
- Some ISPs DNS-hijack `rpc.mainnet.chain.robinhood.com`; set `NEXT_PUBLIC_RPC_URL` to a provider endpoint (Alchemy free tier) if reads fail.
