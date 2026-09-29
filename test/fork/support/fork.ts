import {
  createTestClient,
  createWalletClient,
  encodeAbiParameters,
  erc20Abi,
  http,
  parseAbi,
  parseEther,
  publicActions,
  walletActions,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "viem/chains";
import { afterEach, beforeEach, inject } from "vitest";

import { parseDeployment } from "@/lib/deployment";
import { marketAbi, type PoolKey } from "@/lib/onchain/contracts";
import type { Clients, MarketRefs, ReadClient } from "@/lib/onchain/reads";

import { POSITION_MANAGER, TWAP_RECORDER, USDG, userKey } from "./constants";

/** Farmenta as deployed on the chain, read the way the app reads a manifest. */
const manifest = JSON.parse(inject("manifest")) as { guardian: Address };
export const deployment = parseDeployment(manifest);

export const blueChip: MarketRefs = { ...deployment.markets["blue-chip"], policy: deployment.collateralPolicy };
export const meme: MarketRefs = { ...deployment.markets.meme, policy: deployment.collateralPolicy };

const transport = http(inject("forkUrl"));

/** anvil mines a transaction at once; polling every 4 seconds for it would be most of the run. */
const pollingInterval = 50;

export const anvil = createTestClient({ chain: robinhood, mode: "anvil", transport, pollingInterval })
  .extend(publicActions)
  .extend(walletActions);
export const publicClient = anvil as unknown as ReadClient;

const nft = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function transferFrom(address from, address to, uint256 tokenId)",
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128)",
  "function getPoolAndPositionInfo(uint256 tokenId) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, uint256 info)",
  "function modifyLiquidities(bytes unlockData, uint256 deadline) payable",
]);
const ownerActions = parseAbi([
  "function owner() view returns (address)",
  "function pause()",
  "function setFrozen(bytes32 poolId, bool frozen)",
]);
const recorder = parseAbi([
  "function record((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key)",
  "function consult(bytes32 poolId) view returns (int24)",
]);

/** Runs every test inside a snapshot, so each starts from the state the harness left. */
export function isolateEachTest() {
  let snapshot: Hex;
  beforeEach(async () => {
    snapshot = await anvil.snapshot();
  });
  afterEach(async () => {
    await anvil.revert({ id: snapshot });
  });
}

/** A wallet nobody has used, with gas money, and the clients the actions take. */
export async function newUser(label: string): Promise<{ address: Address; clients: Clients }> {
  const account = privateKeyToAccount(userKey(label));
  await anvil.setBalance({ address: account.address, value: parseEther("10") });
  const walletClient = createWalletClient({ account, chain: robinhood, transport, pollingInterval });
  return { address: account.address, clients: { publicClient, walletClient } };
}

/** Sets a wallet's USDG balance. */
export async function dealUsdg(to: Address, amount: bigint) {
  await anvil.request({
    // Not in viem's anvil types yet.
    method: "anvil_dealERC20" as never,
    params: [to, USDG, `0x${amount.toString(16)}`] as never,
  });
}

/** Approves `spender` for `amount` of the wallet's USDG, outside any action. */
export async function approveUsdg({ walletClient }: Clients, spender: Address, amount: bigint) {
  await mined(await walletClient.writeContract({ address: USDG, abi: erc20Abi, functionName: "approve", args: [spender, amount] }));
}

export const usdgBalance = (owner: Address) =>
  publicClient.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [owner] });

export const usdgAllowance = (owner: Address, spender: Address) =>
  publicClient.readContract({ address: USDG, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });

export const ownerOf = (tokenId: bigint) =>
  publicClient.readContract({ address: POSITION_MANAGER, abi: nft, functionName: "ownerOf", args: [tokenId] });

async function as<T>(address: Address, run: () => Promise<T>): Promise<T> {
  await anvil.setBalance({ address, value: parseEther("10") });
  await anvil.impersonateAccount({ address });
  try {
    return await run();
  } finally {
    await anvil.stopImpersonatingAccount({ address });
  }
}

async function mined(hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`harness transaction ${hash} reverted`);
  return receipt;
}

/** Moves a real position from whoever holds it on the fork to `to`. */
export async function givePosition(to: Address, tokenId: bigint) {
  const holder = await ownerOf(tokenId);
  await as(holder, async () => {
    await mined(
      await anvil.writeContract({
        account: holder,
        address: POSITION_MANAGER,
        abi: nft,
        functionName: "transferFrom",
        args: [holder, to, tokenId],
      }),
    );
  });
}

export const liquidityOf = (tokenId: bigint) =>
  publicClient.readContract({ address: POSITION_MANAGER, abi: nft, functionName: "getPositionLiquidity", args: [tokenId] });

/**
 * Removes all of a position's liquidity through PositionManager, the way its
 * owner does on Uniswap: `DECREASE_LIQUIDITY` then `TAKE_PAIR`. The NFT stays
 * in the wallet, holding nothing.
 */
export async function emptyPosition({ walletClient }: Clients, tokenId: bigint) {
  const owner = walletClient.account.address;
  const [[key], liquidity, block] = await Promise.all([
    publicClient.readContract({ address: POSITION_MANAGER, abi: nft, functionName: "getPoolAndPositionInfo", args: [tokenId] }),
    liquidityOf(tokenId),
    publicClient.getBlock(),
  ]);
  const DECREASE_LIQUIDITY = "01";
  const TAKE_PAIR = "11";
  const decrease = encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "uint128" }, { type: "uint128" }, { type: "bytes" }],
    [tokenId, BigInt(liquidity), 0n, 0n, "0x"],
  );
  const take = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "address" }],
    [key.currency0, key.currency1, owner],
  );
  const unlockData = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    [`0x${DECREASE_LIQUIDITY}${TAKE_PAIR}`, [decrease, take]],
  );
  await mined(
    await walletClient.writeContract({
      address: POSITION_MANAGER,
      abi: nft,
      functionName: "modifyLiquidities",
      args: [unlockData, block.timestamp + 600n],
    }),
  );
}

/**
 * Pauses a market as the guardian, who may do so at once; the owner's pause waits the timelock.
 * The guardian is the real one, from the manifest, impersonated.
 */
export async function pause(market: Address) {
  const { guardian } = manifest;
  await as(guardian, async () => {
    await mined(await anvil.writeContract({ account: guardian, address: market, abi: ownerActions, functionName: "pause" }));
  });
}

/** Freezes a pool as the policy's owner, whoever that is at the fork's block, impersonated. */
export async function freeze(poolId: Hex) {
  const policy = deployment.collateralPolicy;
  const owner = await publicClient.readContract({ address: policy, abi: ownerActions, functionName: "owner" });
  await as(owner, async () => {
    await mined(
      await anvil.writeContract({
        account: owner,
        address: policy,
        abi: ownerActions,
        functionName: "setFrozen",
        args: [poolId, true],
      }),
    );
  });
}

/** Records a pool's price in `TwapRecorder`, as the keeper does every five minutes. Anyone may. */
export async function recordPrice(key: PoolKey) {
  const keeper = await newUser("price-recorder");
  await mined(
    await keeper.clients.walletClient.writeContract({
      address: TWAP_RECORDER,
      abi: recorder,
      functionName: "record",
      args: [key],
    }),
  );
}

/** Whether the oracle has a 30-minute average for the pool right now: enough history, and a recent recording. */
export const hasAveragePrice = (poolId: Hex) =>
  publicClient
    .readContract({ address: TWAP_RECORDER, abi: recorder, functionName: "consult", args: [poolId] })
    .then(
      () => true,
      () => false,
    );

/** Lets `seconds` pass and mines a block, so interest has something to accrue over. */
export async function wait(seconds: number) {
  await anvil.increaseTime({ seconds });
  await anvil.mine({ blocks: 1 });
}

export const nonceOf = (address: Address) => publicClient.getTransactionCount({ address });

export const sharesOf = (market: Address, owner: Address) =>
  publicClient.readContract({ address: market, abi: marketAbi, functionName: "balanceOf", args: [owner] });

export const totalAssets = (market: Address) =>
  publicClient.readContract({ address: market, abi: marketAbi, functionName: "totalAssets" });

export const debtOf = (market: Address, tokenId: bigint) =>
  publicClient.readContract({ address: market, abi: marketAbi, functionName: "debtOf", args: [tokenId] });
