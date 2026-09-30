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
pnpm test:fork   # the on-chain flows on an anvil fork of the chain as deployed, see test/fork/README.md
pnpm fork        # the same fork, kept running for `pnpm dev`
pnpm abi:sync    # rebuild src/abis from the smart-contract commit in src/abis/source.json
```

## Listed pools

The app has a page for each pool listed on the chain, and for no other:

| Pool | Market | Priced by |
|---|---|---|
| ETH/USDG | Blue chip | Chainlink |
| META/USDG | Blue chip | Chainlink |
| NVDA/USDG | Blue chip | Chainlink |
| CASHCAT/USDG | Meme | 30-minute average, recorded on the chain |
| PONS/USDG | Meme | 30-minute average, recorded on the chain |
| AI/USDG | Meme | 30-minute average, recorded on the chain |

Each is written in `src/lib/markets.ts` with its id and the `PoolKey` the id is the hash of; a
test holds the two together. The list is in the app because the backend cannot name a pool's
tokens yet: all six were created before the indexer's first block. It moves to the backend when
that is done.

Two things differ from pool to pool and are handled by address, not by position: USDG is
currency0 in META/USDG and NVDA/USDG and currency1 in the other four, and ETH/USDG pairs native
ETH, not WETH.

META and CASHCAT have no logo in `public/` yet and are drawn as a lettered disc.

## Displayed figures

Every figure on a page that is not about the connected wallet comes from the backend, through
`src/lib/backend/`: supply APY, borrow APR, utilisation and TVL of a market, a pool's terms, its
debt and its room to borrow, and the history the charts draw. So does the list of the connected
wallet's transactions (see "A wallet's history" below).

- **The address is `NEXT_PUBLIC_API_URL`.** It is public. The paid RPC stays on the backend.
- **Units are converted in the data layer, once.** The backend sends an amount as a decimal
  string of base units, a percentage as a string with two decimals, and `null` for a figure it
  does not have. A component receives USDG and percentages as numbers.
- **A pool's terms are its own.** Max LTV, liquidation threshold, liquidator bonus, debt cap and
  minimum position are read per pool: META/USDG and NVDA/USDG lend at 50% and 65%, not at the
  blue-chip preset of 65% and 75%.
- **Zero is a figure, and an absent figure is a dash.** A market nobody has supplied to shows 0.
  A figure the backend does not have shows a dash. Neither is ever filled with a number.
- **When the backend cannot be read the page says so**, once, above the figures, and the figures
  are dashes. The pages stay open and the on-chain actions keep working: they go through the
  wallet's RPC.
- **A pool the backend lists and the app has no page for is not shown**, and is reported in the
  browser's console.
- **A pool's page has no list of transactions.** The backend has no route for a pool's activity.
- The tests of the data layer read answers recorded from the live backend
  (`src/lib/backend/fixtures/`).

## A wallet's history

The Activity tab of Portfolio lists the connected wallet's transactions in Farmenta, newest
first, from `GET /activity/:address`.

- **Every row the backend sends is listed.** It sends what the wallet supplied and withdrew as a
  lender, shares it sent to another wallet, and what happened to the positions it borrowed
  against: collateral in and out, loans, repayments, changes of liquidity, fees collected, and
  liquidations. A kind the app has no name for is listed as "Other", with its date and its
  transaction. The menu above the table narrows the rows on screen; it asks the backend nothing.
- **The amount is the USDG that moved**, to its last decimal: supplied, withdrawn, borrowed,
  repaid, or repaid by a liquidator. A row that moves no USDG has a dash.
- **25 rows are read at a time.** "Load more" asks for the rows after the last one on screen,
  with the cursor the backend gave. A refresh, every 30 seconds and after each transaction the
  app sends, reads the pages on screen again from the first, so a new transaction does not make
  a row appear twice or drop out between two pages.
- **The rows can be up to a minute behind the chain.** The indexer follows the chain by a few
  seconds, the backend keeps an answer for up to 30 seconds, and the tab asks every 30. A
  transaction the app has just confirmed is listed with the refresh that follows it, about 30
  seconds later.
- **When the backend cannot be read the tab says so**, and links to the wallet on the block
  explorer. It says "No transactions yet." only for a wallet the backend answered for and has
  no transaction of.

## On-chain actions

The app sends six transactions: supply and withdraw USDG, deposit collateral (with a permit),
borrow, repay, and withdraw collateral. They live in `src/lib/onchain/`.

- **Addresses** come from the address manifest, `deployments/<name>.json`, chosen with
  `NEXT_PUBLIC_FARMENTA_DEPLOYMENT` (see `deployments/README.md`). No Farmenta address is written
  in the code. Without a manifest the app builds and the action buttons are disabled.
- **ABIs** are generated from the smart-contract commit pinned in `src/abis/source.json`.
- **What a transaction is decided on** (balance, allowance, `maxWithdraw`, `maxBorrow`, the debt,
  the health factor, `paused`, whether a pool is frozen) is read from the chain through the
  browser's RPC when the user is about to sign. Displayed figures (APY, utilisation, a pool's
  terms, history) belong to the backend data layer.
- **A position that cannot be priced is refused before a signature is asked for**, with the
  oracle's reason. For a stock pool whose price is older than 25 hours the reason says that the
  stock market is closed; for a meme pool, that its price has to be recorded for 30 minutes.
- **A meme position is priced as the next transaction will find it.** The market records the
  pool's price itself at the start of a deposit and of a loan. When a read finds no average price
  because the keeper has been quiet, it is taken again after `PriceOracle.record`, inside one
  `eth_call`. Nothing is sent.
- **Every transaction is simulated first.** A simulation that reverts sends nothing, and the
  contract's error is shown as a sentence (`src/lib/onchain/errors.ts`).
- **Approvals are for the amount being moved**, never unlimited.
- **A transaction is sent with the gas estimate, a tenth more, and 100,000 gas.** The market
  accrues interest at the start of a call, and an estimate taken in the second of the last
  accrual does not pay for it. Gas that is not used is not charged.
- **Reads and writes are pinned to chain 4663.** A wallet on another network is offered the
  switch and cannot send anything until it has switched.
- **A wallet's positions are found in the chain's logs; no token id is typed.** PositionManager
  has no `ERC721Enumerable`, but its `Transfer` event indexes `to` and the market's
  `CollateralDeposited` indexes `owner`. The app reads both, then `ownerOf` and `loanOf` for each
  id, so a position the wallet passed on drops out. A position is shown by its pair, fee and
  price range; the token id is a detail. The backend's list (`GET /portfolio/:address`) is not
  used: the indexer knows a position in a wallet only when it was created after the indexer's
  first block, so the list leaves older positions out. Measured on 30 Sep 2026: of nine
  positions in listed pools, the three created before that block (74,901,824) were missing,
  each of them holding liquidity, and the six created after it were listed.
- **The logs are read through the chain's public RPC**, whatever `NEXT_PUBLIC_RPC_URL` is: a
  free-tier provider key refuses a log range of more than 10 blocks. A request is tried four
  times; after that the list says it could not be loaded and offers a retry.
- **The logs are read in windows of 9,900,000 blocks, one request every 300 ms.** The public
  RPC refuses a range of more than 10,000,000 blocks, and the chain is past block 75,600,000:
  eight windows for PositionManager and one for each market. Sent together they are answered,
  and then every request of the page is refused (HTTP 429) for 2 to 4.5 seconds; the RPC takes
  about 3.5 requests a second. The search took 3.9 to 6.8 seconds in ten runs, none of which
  failed.
- **A paid RPC key in `NEXT_PUBLIC_RPC_URL` is readable by anyone who opens the app.** Restrict
  it to the app's domain at the provider.

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

Four rules the pages keep:

- **Fills are flat.** No gradient on text or on a control, and no coloured glow
  under one. The page has one light, top right, and it does not move.
- **One layer in a card.** A card holds no card: its parts are separated by a
  rule or by space. A chart is drawn on its card, not in a box of its own.
- **Colours come from the tokens** in `globals.css`. The exceptions are other
  projects' logos, the avatar drawn from an address, and the browser's theme
  colour, which a meta tag cannot read from a variable.
- **A control is shown when it has something to choose.** A filter with one
  choice in it, or a button that does nothing, is left out until it has.

## Structure
- `src/lib/chain.ts`: the chain, importable from Server Components (`lib/wagmi.ts` calls RainbowKit's client-only `getDefaultConfig()` at module scope, so it cannot be imported server-side)
- `src/lib/wagmi.ts`: transports + RainbowKit config
- `src/lib/markets.ts`: the two markets and the six listed pools: ids, `PoolKey`s and names, no figures
- `src/lib/backend/`: the data layer: the backend's routes, the conversion of its answers into figures and into the rows of a wallet's history, the hooks, and the recorded answers the tests read
- `src/lib/risk-params.ts`: what belongs to a market and not to a pool (close factor, market debt cap, reserve factor and floor, rate model), from spec §6.2
- `src/lib/format.ts`: how a figure is written, and the dash for one that is absent
- `src/lib/chart-axis.ts`: the value axis of a chart, which has to draw a series that is zero
- `src/lib/deployment.ts`: the address manifest
- `src/lib/units.ts`: USDG (6 decimals), USD (1e18) and bps conversions, shared with the data layer
- `src/lib/query-keys.ts`: query keys for the backend and the chain, and what a transaction invalidates
- `src/lib/onchain/`: reads, gates, the six actions, the permit, error messages, and the hooks
- `src/components/ui/`: primitives (button, badge, field, health bar, logo, tabs, segmented control, select menu, asset and address marks)
- `src/components/site/`: nav, wallet button, app shell, page header
- `src/components/landing/`: the hero for `/`, which is a single screen with nothing under it
- `src/components/app/`: the market directory, the pool page's action rail, charts and activity table, and the portfolio view with the wallet's history
- `src/app/(workspace)/`: the app: `market`, `portfolio`, and one page per pool; `lend` and `borrow` are old addresses that redirect into `market`

## Honesty rules that are part of the design
- **No figure is invented.** APY, APR, utilisation, TVL, a pool's terms and the charts are the backend's, and balances, debt, collateral value and health factor are read from the chain. Where a figure cannot be read there is a dash and a sentence that says why, never a number standing in for it.
- **Owner powers are stated in the contract README and on the documentation site, not in the app.** Spec §15 items 9 (the upgrade key) and 11 (the owner can lower a liquidation threshold) are disclosed at [tech-docs-pearl.vercel.app](https://tech-docs-pearl.vercel.app/), page `risk/admin-powers`. Decided by the product owner on 28 Sep 2026 (spec v1.62); no page of this app carries them.
- **One colour rule for the health factor.** `hfTone()` in `src/components/ui/health-bar.tsx` decides the colour everywhere, so the same number is never cyan on one page and orange on another.

## Notes
- The Portfolio page shows the connected wallet, its deposit in each market, and the loans on the positions this browser knows for it, all read from the chain and pinned to `chainId: 4663`: the same reads the Repay and Withdraw buttons are decided on, so a figure and the action under it never disagree. Two things on it are the backend's: the Activity tab, from the activity route, and Net APY, which is the supply APY of the market for a wallet with a deposit there and zero for a wallet without.
- A position shows its uncollected fees in full, beside its value. On collateral the two differ: the market lends against fees only up to a tenth of the principal (spec §6.2).
- The balance over time beside a deposit is a level line: the backend has no route for a wallet's balance history.
- The Market and Rates charts on a pool's page are the history of the pool's market: lenders supply to the market, and every pool in it borrows from the same USDG at the same rate.
- Some ISPs DNS-hijack `rpc.mainnet.chain.robinhood.com`; set `NEXT_PUBLIC_RPC_URL` to a provider endpoint (Alchemy free tier) if reads fail.
- `src/app/icon.png` and `apple-icon.png` are generated from the logo; regenerate them if the logo changes.
