# Farmenta · Web

Frontend for Farmenta. Borrow USDG against Uniswap v4 LP position NFTs on Robinhood Chain (4663). Documentation: [tech-docs-pearl.vercel.app](https://tech-docs-pearl.vercel.app/). Built against spec **v0.9**.

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

```bash
pnpm lint
pnpm test        # unit tests, no network
pnpm test:fork   # the on-chain flows against a deployed anvil fork, see test/fork/README.md
pnpm fork        # the same fork, kept running for `pnpm dev`
pnpm abi:sync    # rebuild src/abis from the smart-contract commit in src/abis/source.json
```

## On-chain actions

The app sends six transactions: supply and withdraw USDG, deposit collateral (with a permit),
borrow, repay, and withdraw collateral. They live in `src/lib/onchain/`.

- **Addresses** come from the address manifest, `deployments/<name>.json`, chosen with
  `NEXT_PUBLIC_FARMENTA_DEPLOYMENT` (see `deployments/README.md`). No Farmenta address is written
  in the code. Without a manifest the app builds and the action buttons are disabled.
- **ABIs** are generated from the smart-contract commit pinned in `src/abis/source.json`.
- **What a transaction is decided on** (balance, allowance, `maxWithdraw`, `maxBorrow`, the debt,
  the health factor, `paused`, whether a pool is frozen) is read from the chain through the
  browser's RPC when the user is about to sign. Displayed figures (APY, utilisation, pool lists,
  history) belong to the backend data layer.
- **Every transaction is simulated first.** A simulation that reverts sends nothing, and the
  contract's error is shown as a sentence (`src/lib/onchain/errors.ts`).
- **Approvals are for the amount being moved**, never unlimited.
- **Reads and writes are pinned to chain 4663.** A wallet on another network is offered the
  switch and cannot send anything until it has switched.
- **Positions are found by token id.** PositionManager cannot list a wallet's positions, so the
  app keeps the ids a wallet added in this browser and reads each from the chain. The backend's
  list replaces this when the data layer lands.

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
- `src/lib/risk-params.ts`: §6.2 risk parameters at spec v0.9, **single source** for pool pages, the action rail, and the market mock data
- `src/lib/pool-history.ts`: generated balance, rate and transaction history for pool pages, seeded per pool so the server and the browser draw the same chart
- `src/lib/markets.ts`: market and pool model, with mock activity data
- `src/lib/deployment.ts`: the address manifest
- `src/lib/units.ts`: USDG (6 decimals), USD (1e18) and bps conversions, shared with the data layer
- `src/lib/query-keys.ts`: query keys for the backend and the chain, and what a transaction invalidates
- `src/lib/onchain/`: reads, gates, the six actions, the permit, error messages, and the hooks
- `src/components/ui/`: primitives (button, badge, field, health bar, logo, tabs, segmented control, select menu, asset and address marks)
- `src/components/site/`: nav, wallet button, app shell, page header
- `src/components/landing/`: the hero for `/`, which is a single screen with nothing under it
- `src/components/app/`: the market directory, the pool page's action rail, charts and activity table, and the portfolio view
- `src/app/(workspace)/`: the app: `market`, `portfolio`, and one page per pool; `lend` and `borrow` are old addresses that redirect into `market`

## Honesty rules that are part of the design
- **Placeholder numbers are labelled.** APY, APR, utilisation, TVL and the mock positions are invented until FarmentaMarket is deployed, and a lending UI that shows invented yields without a label is lying. Pool pages say "Simulated" on each generated section and in each headline metric's tooltip. The action rail's own figures (balances, debt, collateral value, health factor) are read from the chain. The market table does not carry a label yet and needs one.
- **Owner powers are not on any page right now, and the spec says they must be.** Spec §15 items 9 (a single upgrade key can replace the protocol and take the collateral) and 11 (the owner can lower a liquidation threshold and make a healthy loan liquidatable) have to appear in the frontend. They were shown on `/` and `/risk`; both surfaces were removed, and the component that rendered them went with them (last present in the commit before this one, at `src/components/site/risk-disclosures.tsx`). They need a new home before launch.
- **One colour rule for the health factor.** `hfTone()` in `src/components/ui/health-bar.tsx` decides the colour everywhere, so the same number is never cyan on one page and orange on another.

## Notes
- The Portfolio page shows the connected wallet, its deposit in each market, and the loans on the positions this browser knows for it, all read from the chain and pinned to `chainId: 4663`. Net APY and the Activity tab are still empty; they come from the backend data layer.
- Pool pages draw their Market, Rates and Activity sections from `src/lib/pool-history.ts`, which generates them from a seed. Each of those sections is labelled "Simulated".
- Some ISPs DNS-hijack `rpc.mainnet.chain.robinhood.com`; set `NEXT_PUBLIC_RPC_URL` to a provider endpoint (Alchemy free tier) if reads fail.
- `src/app/icon.png` and `apple-icon.png` are generated from the logo; regenerate them if the logo changes.
