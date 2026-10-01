# Farmenta · Web

Frontend for Farmenta. Borrow USDG against Uniswap v4 LP position NFTs on Robinhood Chain (4663). Documentation: [docs.farmenta.fun](https://docs.farmenta.fun/). Built against spec **v0.9**.

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
wallet's transactions and the list of a pool's (see "A wallet's history" and "A pool's history"
below).

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
- **A pool's page lists the pool's transactions** (see "A pool's history" below).
- The tests of the data layer read answers recorded from the live backend
  (`src/lib/backend/fixtures/`).

## A wallet's history

The Activity tab of Portfolio lists the connected wallet's transactions in Farmenta, newest
first, from `GET /activity/:address`.

- **Every row the backend sends is listed.** It sends what the wallet supplied and withdrew as a
  lender, shares it sent to another wallet, and what happened to the positions it borrowed
  against: collateral in and out, loans, repayments, changes of liquidity, fees collected, and
  liquidations. A change of liquidity pays the position's fees out in the same
  transaction, and the two logs are one row: "Remove liquidity", with "Fees collected with it"
  under it. A kind the app has no name for is listed as "Other", with its date and its
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

## A pool's history

The Activity section of a pool's page lists the transactions on the pool's positions, from every
wallet, newest first, from `GET /pools/:poolId/activity`.

- **It holds what happens to a position in the pool**: collateral in and out, loans, repayments
  and liquidations. A lender's supply and withdrawal are not there: lenders supply to the market,
  not to a pool, and a wallet's own are in its Portfolio.
- **The menu above the table is the backend's filter.** Choosing a kind asks the backend for
  that kind from its first page; the wallet's menu narrows what is already on screen.
- **Each row names the position and whose it is.** The date links to the transaction on the
  block explorer and the wallet to its address there; the column beside the action rail has no
  room for a hash. For a liquidation the wallet is the one that was liquidated.
- **Amounts, pages, refreshes and how far behind the chain the rows can be** are as in a
  wallet's history.
- **When the backend cannot be read the section says so.** It says "No transactions in this pool
  yet." only for a pool the backend answered for.

## On-chain actions

The app sends nine transactions: supply and withdraw USDG, deposit collateral (with a permit),
borrow, repay, withdraw collateral, and for a deposited position collect its fees, add liquidity
to it and remove part of its liquidity. They live in `src/lib/onchain/`.

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
- **A deposited position's fees are collected with `collectFees`, to the connected wallet**
  (the fee half of FAR-73). The market holds the NFT, so Uniswap's own page cannot collect them.
  Both tokens arrive, USDG first, and the position stays deposited; no other recipient is
  offered. "Collect fees" on the position's row in Portfolio opens a panel, and the pool's page
  has the button under its action rail. In both, the button names what it pays out in each
  token, read from `PositionValuer.value(tokenId)` at that moment ("Collect 0.0005439 ETH and
  1.1277 USDG"); the ETH pool pays native ETH. For a position with a loan a sentence beside
  it says that the market counts the fees as collateral and that collecting them lowers the
  health factor. The button is left out while the position has no fees in either token. A
  frozen pool does not stop it; a paused market does. With a loan the market checks the health
  factor once the fees have left, at the prices it lends at, so a loan that cannot be priced
  cannot collect either, and one that would end under 1 is refused in the simulation with a
  sentence. Without a loan no price is needed.
- **Liquidity is added to a deposited position with `increaseLiquidity`** (the part of FAR-66
  that is about an existing position), from "Add liquidity" on the position's row in Portfolio.
  The amount is 25%, 50% or 100% of the liquidity the position holds, which works for a position
  in its range, taking both tokens, and for one outside it, taking one. The panel shows, for
  each token, what the addition takes at the pool's price now, the most the wallet agrees to
  pay, and what the wallet holds.
- **What an addition costs is computed from the pool's price**, read from the `StateView` the
  valuer itself reads (`getSlot0`), with Uniswap's own arithmetic in integers
  (`src/lib/onchain/liquidity-math.ts`): `TickMath.getSqrtPriceAtTick`, the two rounded-up
  amount formulas, and the pool's three cases by its tick. On the fork an addition spends that
  figure to the unit, in all six pools.
- **The maximum is the need plus the slippage tolerance, rounded up, and it is one figure
  everywhere**: the approval to Permit2, the Permit2 permit, the call, and for the ETH pool the
  ETH sent. Nothing is approved or permitted without limit, and after an addition nothing is
  left approved. 0.5% unless the user changes it, a warning above 1%, refused above 5%
  (spec §12). The maximum is the only bound the contract holds an addition to: one unit under
  the need, and PositionManager reverts.
- **An addition is an approval for each ERC-20 token, a signature, and the transaction.** The
  market pulls the tokens through Permit2 straight to PositionManager, with the market as the
  permit's only spender and a deadline of ten minutes. Native ETH is no leg of the permit. A
  token that gives Permit2 an allowance of its own accord (AI does) is not approved by the app.
  What the addition does not take comes back in the same transaction, with the position's fees.
- **The price is read again before anything is approved or signed.** A need that has grown past
  a maximum is refused there, and the panel offers "Get a new quote"; the tolerance stays as it
  was set. A pool that is frozen or no longer listed, a paused market, a loan that cannot be
  priced and a wallet that holds less than a maximum are refused before the wallet is asked
  too. A market the app holds closed refuses an addition, as it refuses a deposit.
- **Part of a deposited position's liquidity is removed with `decreaseLiquidity`** (the other
  half of FAR-73), from "Remove liquidity" on the position's row in Portfolio. The share is 25%,
  50% or 75% of the position's liquidity. The whole of it is not offered: what stays has to be
  worth the pool's minimum, and a position leaves whole through a repayment and "Withdraw
  collateral". The panel shows, for each token, the principal the pool pays now, the fees that
  leave with it, and the least principal the transaction accepts.
- **The quote of a removal is the chain's.** The call is simulated with a minimum nothing can
  meet, and PositionManager's refusal carries the principal it would have paid, fees apart
  (`MinimumAmountInsufficient`). `PositionValuer.value` is not used for it: it splits a
  position at the oracle's price, and the pool pays at its own. Measured on the fork, a
  quarter of each blue-chip position differed from the valuer's split by 0.8% to 1.4% in a
  token, more than the tolerance. The quote is read again every 15 seconds.
- **The minimums are the quote less the slippage tolerance, rounded down, of the principal
  alone.** 0.5% of each token unless the user changes it; above 1% the panel warns, above 5% it
  refuses (spec §12, the rule for adding liquidity, taken for removing it: decided by the
  product owner, 1 Oct 2026). The simulation that runs before the wallet is asked is the price
  read again. A price that moved past the minimums sends nothing, and the panel offers "Get a
  new quote"; the tolerance stays as it was set.
- **A removal is refused with what to do about it** when the loan would not fit what is left
  ("Remove less, or repay until the loan fits") and when too little would be left ("repay the
  loan and withdraw the collateral"). A removal always needs a price, loan or no loan: the
  market values what is left against the pool's minimum. A paused market stops it and a frozen
  pool does not.
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
- `src/lib/onchain/`: reads, gates, the nine actions, the arithmetic and the permit of an addition of liquidity, the quote of a removal, the permit, error messages, and the hooks
- `src/components/ui/`: primitives (button, badge, field, health bar, logo, tabs, segmented control, select menu, asset and address marks)
- `src/components/site/`: nav, wallet button, app shell, page header
- `src/components/landing/`: the hero for `/`, which is a single screen with nothing under it
- `src/components/app/`: the market directory, the pool page's action rail, charts and activity table, and the portfolio view with the wallet's history
- `src/app/(workspace)/`: the app: `market`, `portfolio`, and one page per pool; `lend` and `borrow` are old addresses that redirect into `market`

## Honesty rules that are part of the design
- **No figure is invented.** APY, APR, utilisation, TVL, a pool's terms and the charts are the backend's, and balances, debt, collateral value and health factor are read from the chain. Where a figure cannot be read there is a dash and a sentence that says why, never a number standing in for it.
- **Owner powers are stated in the contract README and on the documentation site, not in the app.** Spec §15 items 9 (the upgrade key) and 11 (the owner can lower a liquidation threshold) are disclosed at [docs.farmenta.fun](https://docs.farmenta.fun/), page `risk/admin-powers`. Decided by the product owner on 28 Sep 2026 (spec v1.62); no page of this app carries them.
- **One colour rule for the health factor.** `hfTone()` in `src/components/ui/health-bar.tsx` decides the colour everywhere, so the same number is never cyan on one page and orange on another.

## Notes
- The Portfolio page shows the connected wallet, its deposit in each market, and the loans on the positions this browser knows for it, all read from the chain and pinned to `chainId: 4663`: the same reads the Repay and Withdraw buttons are decided on, so a figure and the action under it never disagree. Two things on it are the backend's: the Activity tab, from the activity route, and Net APY, which is the supply APY of the market for a wallet with a deposit there and zero for a wallet without.
- A position shows its uncollected fees in full, beside its value. On collateral the two differ: the market lends against fees only up to a tenth of the principal (spec §6.2).
- The balance over time beside a deposit is a level line: the backend has no route for a wallet's balance history.
- **A market can be held closed in the app** (`CLOSED_MARKETS` in `src/lib/markets.ts`). Its pools stay in the directory with a "Temporarily closed" badge, turn red under the pointer, and do not open from there. A pool's page, which its address still reaches, carries the same badge, and its action rail refuses supplying, depositing a position and borrowing with that label on the button, and Portfolio refuses adding liquidity the same way; withdrawing, repaying, taking collateral back, collecting a position's fees and removing its liquidity stay open. The app gives the label and no further reason (decided by the product owner, 1 Oct 2026). Nothing is paused or frozen on the chain: this is the app's switch only. The Meme market is closed this way since 1 Oct 2026, because the `TwapRecorder` deployed that day holds no recordings yet and the oracle prices a meme pool from 30 minutes of them. Removing the `meme` entry opens it again.
- The Market and Rates charts on a pool's page are the history of the pool's market: lenders supply to the market, and every pool in it borrows from the same USDG at the same rate.
- Some ISPs DNS-hijack `rpc.mainnet.chain.robinhood.com`; set `NEXT_PUBLIC_RPC_URL` to a provider endpoint (Alchemy free tier) if reads fail.
- `src/app/icon.png` and `apple-icon.png` are generated from the logo; regenerate them if the logo changes.
