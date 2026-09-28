import {
  createTestClient,
  createWalletClient,
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
import { marketAbi } from "@/lib/onchain/contracts";
import type { Clients, MarketRefs, ReadClient } from "@/lib/onchain/reads";

import { deployer, guardian, POSITION_MANAGER, USDG, userKey } from "./constants";

/** What the harness deployed, read the way the app reads a manifest. */
export const deployment = parseDeployment(JSON.parse(inject("manifest")));

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
]);
const ownerActions = parseAbi([
  "function pause()",
  "function setFrozen(bytes32 poolId, bool frozen)",
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

/** Pauses a market as the guardian, who may do so at once; the owner's pause waits the timelock. */
export async function pause(market: Address) {
  const wallet = createWalletClient({ account: guardian, chain: robinhood, transport });
  await mined(await wallet.writeContract({ address: market, abi: ownerActions, functionName: "pause" }));
}

/** Freezes a pool as the policy's owner, which is the deployer until the timelock accepts it. */
export async function freeze(poolId: Hex) {
  const wallet = createWalletClient({ account: deployer, chain: robinhood, transport });
  await mined(
    await wallet.writeContract({
      address: deployment.collateralPolicy,
      abi: ownerActions,
      functionName: "setFrozen",
      args: [poolId, true],
    }),
  );
}

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
