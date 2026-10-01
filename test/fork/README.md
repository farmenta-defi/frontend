# Fork tests

`pnpm test:fork` runs the on-chain flows against Farmenta as it is deployed, on a local fork of
Robinhood Chain. No mock stands in for a contract: the markets, the lenses, the policy, the
oracle, `TwapRecorder`, USDG, PositionManager, the pools' hooks and the Chainlink feeds are the
real bytecode over real state.

## What it needs

- **Foundry** (`anvil`) on `PATH`.
- **An archive RPC for chain 4663**, in `.env.test.local`:

  ```sh
  ROBINHOOD_RPC_URL=https://robinhood-mainnet.g.alchemy.com/v2/<KEY>
  ```

  The fork is pinned to a block, and the public RPC keeps only minutes of state history. The
  same variable, with the same meaning, as in the `smart-contract` repo.

Nothing is built or deployed, so neither `forge` nor a checkout of the contracts is needed. The
ABIs the tests call with are the app's, pinned in `src/abis/source.json` to the commit the
deployment was made from.

## What a run does

`scripts/fork.mjs`, once per run:

1. starts `anvil` as a fork at block 77,216,000 (1 Oct 2026, 08:02 UTC), on the deployment of
   that day. All six pools are listed by then;
2. reads the manifest the app runs on in production, `deployments/mainnet.json`;
3. checks on the fork that each of the six pools takes new positions, and stops if one does not;
4. records the three meme pools' prices in `TwapRecorder` every five minutes for 35 minutes of
   the fork's own time, as the keeper does on the chain. `TwapRecorder` was deployed anew with
   the rest and held no recording at that block, and the oracle prices a meme pool only from 30
   minutes of them. The fork's clock therefore starts 35 minutes after the block's.

The tests read the manifest through `parseDeployment`, the way the app reads one. Every test
runs inside an anvil snapshot and starts from the state above.

Wallets are made for the run from labels, not taken from anvil's well-known keys: on a fork of
mainnet those addresses carry whatever state people have given them. Collateral positions are
real ones, listed in `support/constants.ts` with what each holds, moved to a test wallet by
impersonating their holder. The guardian and the policy's owner are the real ones, impersonated.

Time on the fork runs on from the block's. The oracle takes a recorded meme price for fresh for
900 seconds, so a test that needs a meme pool priced records its price first, as the keeper
does every five minutes (`recordPrice`).

`earlier-blocks.test.ts` starts two more forks, one after the other, for what a page says of a
pool that is not ready yet: at block 77,210,770 the three blue-chip pools are listed and the
three meme pools are not, and at block 77,211,000 the meme pools are listed and none of their
prices has been recorded. Nothing is recorded on these two forks at their start.

## The same fork, for the app

`pnpm fork` runs the same script and keeps the fork up on port 8545 (`FORK_PORT` changes it):

```sh
pnpm fork
NEXT_PUBLIC_FARMENTA_DEPLOYMENT=mainnet NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545 \
  NEXT_PUBLIC_LOGS_RPC_URL=http://127.0.0.1:8545 NEXT_PUBLIC_LOGS_FROM_BLOCK=77216000 pnpm dev
```

The two `LOGS` variables point the search for a wallet's positions at the fork. It reads logs
from PositionManager's deployment block otherwise, and a fork over a free-tier RPC cannot serve
that range; from the fork's block it finds every position that reached a wallet on the fork.

The wallet has to be pointed at the same RPC, as a network with chain id 4663. Its state is gone
when the fork stops.

The figures on the pages are the backend's, which reads the chain and not the fork: what is done
on the fork shows in the action rail and in Portfolio, which read the chain through the RPC
above, and not in the market table or the charts.
