// A local fork of Robinhood Chain, as it was just after Farmenta's six pools were listed on the
// deployment of 1 Oct 2026.
//
//   pnpm fork            start it on port 8545 and keep it running, for `pnpm dev`
//
// `pnpm test:fork` starts its own through `startFork()` and stops it when the run ends.
//
// What a start does:
//   1. `anvil` as a fork at FORK_BLOCK. Nothing is deployed to it: Farmenta is on the chain
//      (docs ARCHITECTURE.md §18.2), and the manifest is the one the app runs on in
//      production, deployments/mainnet.json
//   2. every pool in LISTED_POOLS is read back from the policy on the fork. A pool that is not
//      listed there, or takes no new positions, stops the start
//   3. at FORK_BLOCK only: the three meme pools' prices are recorded in `TwapRecorder` every
//      five minutes for 35 minutes of the fork's own time, as the keeper does on the chain.
//      `TwapRecorder` was deployed anew on 1 Oct 2026 and nobody had recorded in it by
//      FORK_BLOCK, and the oracle prices a meme pool only from 30 minutes of recordings
//
// The pools in LISTED_POOLS are the ones the app has a page for (`src/lib/markets.ts`); a unit
// test holds the two lists together.
//
// Needs anvil (Foundry) and ROBINHOOD_RPC_URL (an archive RPC for chain 4663) in
// .env.test.local or the environment.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createTestClient, http, keccak256, parseAbi, publicActions, toHex, walletActions, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "viem/chains";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST = join(ROOT, "deployments/mainnet.json");

/**
 * 1 Oct 2026, 08:02 UTC, on the deployment of that day (docs ARCHITECTURE.md §18.2). All six
 * pools are listed (the last in block 77,210,845). No meme price had been recorded on the
 * chain by then, so the start records them on the fork (step 3 above) and the fork's clock
 * ends 35 minutes after the block's. The oracle takes a recording for fresh for 900 seconds,
 * which is what a run has to finish in before the meme pools' prices have to be recorded again
 * (the market does so itself when a position is deposited or borrowed against).
 */
export const FORK_BLOCK = 77_216_000n;

/**
 * 1 Oct 2026, between the listings: ETH, META and NVDA are listed (by block 77,210,762) and
 * CASHCAT, PONS and AI are not yet (from block 77,210,787). What a pool's page has to say
 * before its pool is listed is tested here.
 */
export const BEFORE_MEME_LISTINGS_BLOCK = 77_210_770n;

/**
 * 1 Oct 2026, just after the last listing: all six pools are listed, and no price of a meme
 * pool has been recorded. What a meme pool's page has to say before it has 30 minutes of
 * prices is tested here.
 */
export const BEFORE_MEME_PRICES_BLOCK = 77_211_000n;

/** Addresses from docs ARCHITECTURE.md §18. External contracts, not Farmenta's. */
export const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

/** Uniswap v4's mark, in `fee`, for a pool whose hook sets the swap fee. */
const DYNAMIC_FEE = 0x800000;

/** Native ETH and USDG, dynamic fee, hook `FablesRampETH`. */
export const ETH_USDG = {
  tier: "blue-chip",
  key: { currency0: zeroAddress, currency1: USDG, fee: DYNAMIC_FEE, tickSpacing: 10, hooks: "0x06a889870C8f83640D6816319f72e2aA579b6080" },
  id: "0xbac3aa3b91584a53a579b3c999a56756e954e59247e497bad1d25a4334bde551",
};

/** USDG is currency0 in the two stock pools. */
export const META_USDG = {
  tier: "blue-chip",
  key: { currency0: USDG, currency1: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35", fee: 3000, tickSpacing: 60, hooks: zeroAddress },
  id: "0x5875d407a42965b0e768c8925cea290e06fa50603ef34fc99eb92a1050e6ae36",
};

export const NVDA_USDG = {
  tier: "blue-chip",
  key: { currency0: USDG, currency1: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", fee: 100, tickSpacing: 1, hooks: zeroAddress },
  id: "0x6444a8e0b267406a15db74ca00c4a24bdfa81ed3180f5b6d0851f8ed6f4f29c5",
};

export const CASHCAT_USDG = {
  tier: "meme",
  key: { currency0: "0x020bfC650A365f8BB26819deAAbF3E21291018b4", currency1: USDG, fee: 2690, tickSpacing: 54, hooks: zeroAddress },
  id: "0xa92a3df27a00a276183ff7265fd8affa11df1fe8bb23ddfaf13f6c879a3f818b",
};

/** Dynamic fee, hook `FablesRamp`. */
export const PONS_USDG = {
  tier: "meme",
  key: { currency0: "0x39dBED3a2bd333467115dE45665cC57F813C4571", currency1: USDG, fee: DYNAMIC_FEE, tickSpacing: 60, hooks: "0x08E52564Bad99E05a694b4809F397edcA417A080" },
  id: "0x486435a1f76cd58193f854c6e6213cd05fd58d637865d02065ff558b387fa6ea",
};

export const AI_USDG = {
  tier: "meme",
  key: { currency0: "0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18", currency1: USDG, fee: 2300, tickSpacing: 23, hooks: zeroAddress },
  id: "0x7aebd80541bfaaf23dbb6e99ce13d4d31c1a84c91414f971eadbff7db5f85995",
};

/** The pools listed on the chain at FORK_BLOCK, which are the pools the app has a page for. */
export const LISTED_POOLS = [ETH_USDG, META_USDG, NVDA_USDG, CASHCAT_USDG, PONS_USDG, AI_USDG];

/**
 * WETH and USDG, no hook, fee 200: a real pool that Farmenta does not list. The app had a
 * page for it, and for ETH/USDG at fee 460, while nothing was deployed.
 */
export const WETH_USDG_UNLISTED = {
  key: { currency0: WETH, currency1: USDG, fee: 200, tickSpacing: 4, hooks: zeroAddress },
  id: "0x84bd4e2d8be11aeb0afc1195b38f587b61e90068548f1063fdbe448fb8cad0b6",
};

/**
 * Keys made for the fork from a label, not anvil's well-known ones: on a fork of mainnet
 * the well-known addresses carry whatever state people have given them, delegations included.
 */
export const forkKey = (label) => keccak256(toHex(`farmenta-fork-${label}`));

function fail(message) {
  throw new Error(`fork: ${message}`);
}

function loadEnv() {
  for (const file of [".env.test.local", ".env.local"]) {
    const path = join(ROOT, file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

function freePort() {
  return new Promise((done, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

const policyAbi = parseAbi(["function acceptsNewPositions(bytes32 poolId) view returns (bool)"]);
const recorderAbi = parseAbi([
  "function record((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key)",
]);

/** The keeper's schedule: a recording every five minutes, and 30 minutes of them before a price. */
const RECORD_EVERY_SECONDS = 300;
const RECORDINGS = 8;

/**
 * Records the meme pools' prices on the fork the way the keeper does on the chain, so that
 * the oracle has its 30 minutes of them. Anyone may record; the wallet is made for the fork.
 */
async function recordMemePrices(client, recorder, pools) {
  const account = privateKeyToAccount(forkKey("fork-price-recorder"));
  await client.setBalance({ address: account.address, value: 10n ** 18n });
  for (let recorded = 0; recorded < RECORDINGS; recorded++) {
    for (const pool of pools) {
      const hash = await client.writeContract({ account, address: recorder, abi: recorderAbi, functionName: "record", args: [pool.key] });
      const receipt = await client.waitForTransactionReceipt({ hash, pollingInterval: 50 });
      if (receipt.status !== "success") fail(`recording the price of pool ${pool.id} reverted`);
    }
    if (recorded < RECORDINGS - 1) {
      await client.increaseTime({ seconds: RECORD_EVERY_SECONDS });
      await client.mine({ blocks: 1 });
    }
  }
}

/**
 * Starts the fork.
 * @param {{ port?: number, block?: bigint, listed?: { id: string }[] }} [options] `port`
 *   defaults to one that is free, `block` to FORK_BLOCK, and `listed`, the pools that have to
 *   take new positions at that block, to LISTED_POOLS. A fork at another block than FORK_BLOCK
 *   is left as the chain was: no price is recorded on it.
 * @returns {Promise<{ url: string, manifest: string, stop: () => void }>} `manifest` is the
 *   JSON text of deployments/mainnet.json.
 */
export async function startFork(options = {}) {
  loadEnv();
  const upstream = process.env.ROBINHOOD_RPC_URL?.trim();
  if (!upstream) {
    fail("ROBINHOOD_RPC_URL is not set. Put an archive RPC for chain 4663 in .env.test.local (see test/fork/README.md)");
  }

  // anvil asks the upstream RPC for the chain id and the block as it starts, and gives up
  // when the answer is 429: a free-tier key is rate limited, more so right after another
  // fork has read its state through it. That passes, so the start is tried again.
  for (let attempt = 1; ; attempt++) {
    try {
      return await startOnce(upstream, options);
    } catch (error) {
      if (attempt >= START_ATTEMPTS || !(error instanceof AnvilExited)) throw error;
      console.error(`fork: ${error.message}; trying again in ${RETRY_AFTER_MS / 1000} seconds (${attempt} of ${START_ATTEMPTS})`);
      await new Promise((next) => setTimeout(next, RETRY_AFTER_MS));
    }
  }
}

const START_ATTEMPTS = 4;
const RETRY_AFTER_MS = 15_000;

/** anvil stopped before it answered, which is what it does when the upstream RPC refuses it. */
class AnvilExited extends Error {}

async function startOnce(upstream, { port, block = FORK_BLOCK, listed = LISTED_POOLS }) {
  port ??= await freePort();
  const url = `http://127.0.0.1:${port}`;
  const anvil = spawn(
    "anvil",
    // `--no-rate-limit`: anvil otherwise paces its requests to the upstream RPC for a free-tier
    // budget, which is most of a run's time. The pinned block's state is cached on disk.
    ["--fork-url", upstream, "--fork-block-number", String(block), "--port", String(port), "--no-rate-limit", "--silent"],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  const stop = () => {
    anvil.kill("SIGTERM");
  };
  let exited;
  anvil.once("exit", (code) => {
    exited = code ?? -1;
  });
  anvil.once("error", (error) => {
    exited = -1;
    console.error(`fork: anvil did not start (${error.message}); is Foundry installed?`);
  });

  try {
    const client = createTestClient({ chain: robinhood, mode: "anvil", transport: http(url) })
      .extend(publicActions)
      .extend(walletActions);

    for (let attempt = 0; ; attempt++) {
      if (exited !== undefined) throw new AnvilExited(`anvil exited with code ${exited} before it was ready`);
      try {
        await client.getBlockNumber();
        break;
      } catch (error) {
        if (attempt > 120) throw error;
        await new Promise((next) => setTimeout(next, 250));
      }
    }

    const manifest = readFileSync(MANIFEST, "utf8");
    const policy = JSON.parse(manifest).collateralPolicy.address;
    if (!(await client.getCode({ address: policy }))) {
      fail(`Farmenta is not deployed at block ${block}: there is no code at the policy, ${policy}`);
    }
    for (const pool of listed) {
      const accepts = await client.readContract({
        address: policy,
        abi: policyAbi,
        functionName: "acceptsNewPositions",
        args: [pool.id],
      });
      if (!accepts) fail(`pool ${pool.id} takes no new positions at block ${block}; is it listed there?`);
    }
    if (block === FORK_BLOCK) {
      const recorder = JSON.parse(manifest).twapRecorder.address;
      await recordMemePrices(client, recorder, listed.filter((pool) => pool.tier === "meme"));
    }

    return { url, manifest, stop };
  } catch (error) {
    stop();
    throw error;
  }
}

// `pnpm fork`: keep one running for the app.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.FORK_PORT ?? 8545);
  const { url, stop } = await startFork({ port });
  console.log(`fork: Robinhood Chain from block ${FORK_BLOCK} is on ${url} (chain 4663), with Farmenta as deployed`);
  console.log(`fork: pools listed: ${LISTED_POOLS.map((pool) => pool.id).join(", ")}`);
  console.log("fork: run the app against it with");
  console.log(
    `fork:   NEXT_PUBLIC_FARMENTA_DEPLOYMENT=mainnet NEXT_PUBLIC_RPC_URL=${url} NEXT_PUBLIC_LOGS_RPC_URL=${url} NEXT_PUBLIC_LOGS_FROM_BLOCK=${FORK_BLOCK} pnpm dev`,
  );
  console.log("fork: Ctrl-C stops it; its state is gone with it");
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      stop();
      process.exit(0);
    });
  }
}
