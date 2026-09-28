// A local fork of Robinhood Chain with Farmenta deployed to it.
//
//   pnpm fork            start it on port 8545 and keep it running, for `pnpm dev`
//
// `pnpm test:fork` starts its own through `startFork()` and stops it when the run ends.
//
// What a start does:
//   1. `anvil` as a fork at FORK_BLOCK, the block smart-contract's fork tests pin
//   2. smart-contract's `script/Deploy.s.sol`, default settings: the timelock owns the
//      markets, and the deployer owns the policy until the timelock accepts it. `GUARDIAN`,
//      which has no default, is a key of the fork's own
//   3. smart-contract's `script/manifest.sh` into deployments/fork.json, then the broadcast
//      log is deleted, as the contract README asks after a rehearsal
//   4. the pools in LISTED_POOLS are listed on blue-chip preset terms, as the deployer
//
// Needs anvil and forge (Foundry), jq, ROBINHOOD_RPC_URL (an archive RPC for chain 4663) in
// .env.test.local or the environment, and the contract checkout the ABIs are pinned to
// (`pnpm abi:sync`, or SMART_CONTRACT_DIR).

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createTestClient, http, keccak256, parseAbi, parseEther, publicActions, toHex, walletActions, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "viem/chains";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST = join(ROOT, "deployments/fork.json");

export const FORK_BLOCK = 54_200_000n;

/** Addresses from docs ARCHITECTURE.md §18. External contracts, not Farmenta's. */
export const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

/** ETH/USDG, no hook, fee 460. */
export const ETH_USDG = {
  key: { currency0: zeroAddress, currency1: USDG, fee: 460, tickSpacing: 9, hooks: zeroAddress },
  id: "0x54f7883914619af9105355bf83ed678bcf9f63560218ac61c9963b9503d0ba32",
};

/** WETH/USDG, no hook, fee 200. Both currencies are ERC-20. */
export const WETH_USDG = {
  key: { currency0: WETH, currency1: USDG, fee: 200, tickSpacing: 4, hooks: zeroAddress },
  id: "0x84bd4e2d8be11aeb0afc1195b38f587b61e90068548f1063fdbe448fb8cad0b6",
};

export const LISTED_POOLS = [ETH_USDG, WETH_USDG];

/** Blue-chip preset terms (spec §6.2), the loosest a listing may be. */
export const BLUE_CHIP_LISTING = {
  maxLtvBps: 6500,
  ltBps: 7500,
  liquidatorBonusBps: 500,
  removeHaircutBps: 0,
  debtCapUsdg: 500_000_000_000n,
  minPositionUsd: 50n * 10n ** 18n,
};

/**
 * Keys made for the fork from a label, not anvil's well-known ones: on a fork of mainnet
 * the well-known addresses carry whatever state people have given them, delegations included.
 */
export const forkKey = (label) => keccak256(toHex(`farmenta-fork-${label}`));
export const DEPLOYER_KEY = forkKey("deployer");
export const deployer = privateKeyToAccount(DEPLOYER_KEY);
/** May pause a market and freeze a pool at once. `Deploy.s.sol` refuses the deployer for it. */
export const guardian = privateKeyToAccount(forkKey("guardian"));

function fail(message) {
  throw new Error(`fork: ${message}`);
}

function loadEnv() {
  for (const file of [".env.test.local", ".env.local"]) {
    const path = join(ROOT, file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

/** The smart-contract checkout, which has to sit on the commit the ABIs are pinned to. */
function contractCheckout() {
  const { commit } = JSON.parse(readFileSync(join(ROOT, "src/abis/source.json"), "utf8"));
  const dir = process.env.SMART_CONTRACT_DIR
    ? resolve(ROOT, process.env.SMART_CONTRACT_DIR)
    : join(ROOT, ".cache/smart-contract");
  if (!existsSync(join(dir, "script/Deploy.s.sol"))) {
    fail(`no smart-contract checkout at ${dir}; run \`pnpm abi:sync\` first, or set SMART_CONTRACT_DIR`);
  }
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  if (head !== commit) fail(`${dir} is at ${head}, but the ABIs are pinned to ${commit}; run \`pnpm abi:sync\``);
  return dir;
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

/**
 * Starts the fork and deploys to it.
 * @param {{ port?: number }} [options] `port` defaults to one that is free.
 * @returns {Promise<{ url: string, manifest: string, stop: () => void }>} `manifest` is the
 *   JSON text of deployments/fork.json.
 */
export async function startFork({ port } = {}) {
  loadEnv();
  const upstream = process.env.ROBINHOOD_RPC_URL?.trim();
  if (!upstream) {
    fail("ROBINHOOD_RPC_URL is not set. Put an archive RPC for chain 4663 in .env.test.local (see test/fork/README.md)");
  }
  const checkout = contractCheckout();

  port ??= await freePort();
  const url = `http://127.0.0.1:${port}`;
  const anvil = spawn(
    "anvil",
    // `--no-rate-limit`: anvil otherwise paces its requests to the upstream RPC for a free-tier
    // budget, which is most of a run's time. The pinned block's state is cached on disk.
    ["--fork-url", upstream, "--fork-block-number", String(FORK_BLOCK), "--port", String(port), "--no-rate-limit", "--silent"],
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
      if (exited !== undefined) fail(`anvil exited with code ${exited} before it was ready`);
      try {
        await client.getBlockNumber();
        break;
      } catch (error) {
        if (attempt > 120) throw error;
        await new Promise((next) => setTimeout(next, 250));
      }
    }

    await client.setBalance({ address: deployer.address, value: parseEther("100") });
    await client.setBalance({ address: guardian.address, value: parseEther("100") });

    // The contract repo's own scripts, with nothing of the caller's environment in the way:
    // `OWNER`, `DEPLOY_TIMELOCK` and the rest keep their defaults.
    const env = {
      NODE_ENV: "test",
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      FOUNDRY_PROFILE: "deploy",
      ROBINHOOD_RPC_URL: url,
      GUARDIAN: guardian.address,
    };
    const log = join(checkout, "broadcast/Deploy.s.sol/4663");
    rmSync(log, { recursive: true, force: true });
    try {
      execFileSync(
        "forge",
        // `--legacy`: forge prices EIP-1559 transactions from the fee history, and a fork that
        // has mined nothing yet has none of its own to give.
        ["script", "script/Deploy.s.sol", "--rpc-url", url, "--broadcast", "--legacy", "--private-key", DEPLOYER_KEY],
        { cwd: checkout, env, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
      );
      mkdirSync(dirname(MANIFEST), { recursive: true });
      execFileSync("script/manifest.sh", ["4663", join(log, "run-latest.json"), MANIFEST], {
        cwd: checkout,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
      });
    } catch (error) {
      fail(`the rehearsal deploy failed:\n${error.stdout ?? ""}\n${error.stderr ?? String(error)}`);
    } finally {
      // A fork's log looks like a mainnet deploy; the contract README says to delete it.
      rmSync(log, { recursive: true, force: true });
      rmSync(join(checkout, "cache/Deploy.s.sol/4663"), { recursive: true, force: true });
    }

    const manifest = readFileSync(MANIFEST, "utf8");
    const policy = JSON.parse(manifest).collateralPolicy.address;

    // Listing is the owner's call, and the deployer is still the policy's owner: the
    // timelock's `acceptOwnership` is scheduled, not executed.
    const listing = parseAbi([
      "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
      "struct ListingParams { uint16 maxLtvBps; uint16 ltBps; uint16 liquidatorBonusBps; uint16 removeHaircutBps; uint128 debtCapUsdg; uint128 minPositionUsd; }",
      "function list(PoolKey key, ListingParams params)",
    ]);
    for (const pool of LISTED_POOLS) {
      const hash = await client.writeContract({
        account: deployer,
        address: policy,
        abi: listing,
        functionName: "list",
        args: [pool.key, BLUE_CHIP_LISTING],
      });
      const receipt = await client.waitForTransactionReceipt({ hash, pollingInterval: 50 });
      if (receipt.status !== "success") fail(`listing ${pool.id} reverted`);
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
  console.log(`fork: Farmenta is deployed on ${url} (chain 4663, block ${FORK_BLOCK} onwards)`);
  console.log(`fork: manifest written to deployments/fork.json; pools listed: ${LISTED_POOLS.map((pool) => pool.id).join(", ")}`);
  console.log("fork: run the app against it with");
  console.log(
    `fork:   NEXT_PUBLIC_FARMENTA_DEPLOYMENT=fork NEXT_PUBLIC_RPC_URL=${url} NEXT_PUBLIC_LOGS_RPC_URL=${url} NEXT_PUBLIC_LOGS_FROM_BLOCK=${FORK_BLOCK} pnpm dev`,
  );
  console.log("fork: Ctrl-C stops it; its state is gone with it");
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      stop();
      process.exit(0);
    });
  }
}
