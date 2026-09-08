# Farmenta · Web

Frontend for Farmenta. Borrow USDG against Uniswap v4 LP position NFTs on Robinhood Chain (4663). Spec: [farmenta-defi/docs](https://github.com/farmenta-defi/docs) (ARCHITECTURE.md **v0.9**).

## Stack
- Next.js 16 (App Router, TypeScript, Turbopack) · pnpm
- wagmi **v2** + viem 2 + RainbowKit 2 (wagmi is pinned to v2 because RainbowKit 2.2.x peer-requires it; upgrade to wagmi 3 when RainbowKit supports it)
- Tailwind CSS v4 + shadcn/ui token names, dark-only
- TanStack Query (via wagmi)

## Develop
```bash
pnpm install
cp .env.example .env.local   # optional: fill WalletConnect id + RPC override
pnpm dev
```

## Design system

The whole interface is derived from `public/farmenta-logo.png`. The mark is a
four-armed vortex whose colours split into a cold half (cyan to blue to navy to
steel) and a warm half (orange to red), and the UI takes that split literally:

- **cold = identity and safety**: brand, links, primary actions, a healthy loan
- **warm = risk, and only risk**: caution, liquidation, owner powers, loss

Nothing neutral is ever allowed to render orange or red. There is no green
anywhere: the palette has none, and blue/orange/red also survives red-green
colour blindness better than a traffic light.

Colours sampled from the logo, defined in `src/app/globals.css`:

| Token | Hex | Role |
|---|---|---|
| `--brand-400` | `#00b9fd` | cyan, accents, healthy state |
| `--brand-500` | `#007ffd` | blue, identity |
| `--brand-600` | `#0b63e5` | button fill (deep enough for white text at AA) |
| `--brand-900` | `#011c46` | navy, depth |
| `--steel-600` | `#45576b` | structural greys |
| `--warn` | `#fd8501` | orange, caution |
| `--danger` | `#fc082a` | red, liquidation, loss |

Type: **Plus Jakarta Sans** (display/figures), **Inter** (UI), **JetBrains Mono**
(addresses, token ids). Radius is `0.875rem`; the ground is navy-tinted, never
pure black.

## Structure
- `src/lib/chain.ts`: the chain, importable from Server Components (`lib/wagmi.ts` calls RainbowKit's client-only `getDefaultConfig()` at module scope, so it cannot be imported server-side)
- `src/lib/wagmi.ts`: transports + RainbowKit config
- `src/lib/contracts.ts`: verified contract addresses + minimal ABIs (full address list: docs ARCHITECTURE.md §18; never reconstruct an address from a truncated form)
- `src/lib/risk-params.ts`: §6.2 risk parameters at spec v0.9, **single source** for the Risk page, the Liquidations page, and the market mock data
- `src/lib/markets.ts`: market/position model + mock activity data, and `MOCK_NOTICE`, the label every surface showing placeholder numbers must render
- `src/components/ui/`: primitives (button, card, badge, stat, field, health bar, logo)
- `src/components/site/`: nav, wallet button, footer, page header, risk disclosures
- `src/components/landing/`: marketing sections for `/`
- `src/components/app/`: the market view
- `src/app/(app)/{market,portfolio,liquidations,risk}`: the app; `lend` and `borrow` redirect into `market`

## Honesty rules that are part of the design
- **Placeholder numbers are labelled.** APY, APR, utilisation, TVL and the mock positions are invented until FarmentaMarket is deployed; every surface that shows them renders `MOCK_NOTICE`. A lending UI that shows invented yields without a label is lying.
- **Owner powers are on the page, not only in the contract README.** `src/components/site/risk-disclosures.tsx` renders spec §15 items 9 (a single upgrade key can replace the protocol and take the collateral) and 11 (the owner can lower a liquidation threshold and make a healthy loan liquidatable). The spec requires these to appear in the frontend. They are shown on both `/` and `/risk`.
- **One colour rule for the health factor.** `hfTone()` in `src/components/ui/health-bar.tsx` decides the colour everywhere, so the same number is never cyan on one page and orange on another.

## Notes
- The live on-chain read (`PositionManager.balanceOf` on Portfolio) already works against mainnet, which proves the wiring is correct. Reads are pinned to `chainId: 4663` so a wallet on the wrong network doesn't break them.
- Some ISPs DNS-hijack `rpc.mainnet.chain.robinhood.com`; set `NEXT_PUBLIC_RPC_URL` to a provider endpoint (Alchemy free tier) if reads fail.
- `src/app/icon.png` and `apple-icon.png` are generated from the logo; regenerate them if the logo changes.
