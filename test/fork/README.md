# Fork tests

`pnpm test:fork` runs the six on-chain flows against a real deployment on a local fork of
Robinhood Chain. No mock stands in for a contract: the market, the lens, the policy, USDG,
PositionManager and the Chainlink feeds are the real bytecode over real state.

## What it needs

- **Foundry** (`anvil`, `forge`) and **jq** on `PATH`.
- **An archive RPC for chain 4663**, in `.env.test.local`:

  ```sh
  ROBINHOOD_RPC_URL=https://robinhood-mainnet.g.alchemy.com/v2/<KEY>
  ```

  The fork is pinned to a block, and the public RPC keeps only minutes of state history. The
  same variable, with the same meaning, as in the `smart-contract` repo.
- **The contract checkout the ABIs are pinned to.** `pnpm abi:sync` clones it into
  `.cache/smart-contract`; `SMART_CONTRACT_DIR` points at one you already have. It has to sit on
  the commit in `src/abis/source.json`, or the run stops.

## What a run does

`scripts/fork.mjs`, once per run:

1. starts `anvil` as a fork at block 54,200,000, the block the contract repo's fork tests pin;
2. deploys with the contract repo's `script/Deploy.s.sol`, default settings, so the timelock owns
   the markets and the deployer owns the policy until the timelock accepts it;
3. builds the manifest with the contract repo's `script/manifest.sh` into `deployments/fork.json`
   (not committed), then deletes the broadcast log, as the contract README asks after a rehearsal;
4. lists ETH/USDG (fee 460) and WETH/USDG (fee 200) on blue-chip preset terms, as the deployer.

The tests read `deployments/fork.json` through `parseDeployment`, the way the app reads a
manifest. Every test runs inside an anvil snapshot and starts from the state above.

Wallets are made for the run from labels, not taken from anvil's well-known keys: on a fork of
mainnet those addresses carry whatever state people have given them. Collateral positions are
real ones from the contract repo's fixtures, moved to a test wallet by impersonating their holder.

## The same fork, for the app

`pnpm fork` runs the same script and keeps the fork up on port 8545 (`FORK_PORT` changes it):

```sh
pnpm fork
NEXT_PUBLIC_FARMENTA_DEPLOYMENT=fork NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545 pnpm dev
```

The wallet has to be pointed at the same RPC, as a network with chain id 4663. Its state is gone
when the fork stops.

## What it does not cover

The meme market: no USDG-quoted meme pool is listed by the harness. FAR-72 is the six flows for
the blue-chip launch.
