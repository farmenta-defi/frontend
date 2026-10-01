import {
  createTestClient,
  createWalletClient,
  encodeAbiParameters,
  erc20Abi,
  hexToBigInt,
  http,
  keccak256,
  numberToHex,
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

/**
 * Everything a test does to a fork and reads from it, bound to the fork at
 * `url`. The run's own fork is below; a test that needs the chain at another
 * block starts one and binds to it.
 */
export function harnessOn(url: string, manifestText: string) {
  /** Farmenta as deployed on the chain, read the way the app reads a manifest. */
  const manifest = JSON.parse(manifestText) as { guardian: Address };
  const deployment = parseDeployment(manifest);

  const blueChip: MarketRefs = { ...deployment.markets["blue-chip"], policy: deployment.collateralPolicy };
  const meme: MarketRefs = { ...deployment.markets.meme, policy: deployment.collateralPolicy };

  const transport = http(url);

  /** anvil mines a transaction at once; polling every 4 seconds for it would be most of the run. */
  const pollingInterval = 50;

  const anvil = createTestClient({ chain: robinhood, mode: "anvil", transport, pollingInterval })
    .extend(publicActions)
    .extend(walletActions);
  const publicClient = anvil as unknown as ReadClient;

  const nft = parseAbi([
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function transferFrom(address from, address to, uint256 tokenId)",
    "function getPositionLiquidity(uint256 tokenId) view returns (uint128)",
    "function getPoolAndPositionInfo(uint256 tokenId) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, uint256 info)",
    "function modifyLiquidities(bytes unlockData, uint256 deadline) payable",
    "function poolManager() view returns (address)",
  ]);
  const ownerActions = parseAbi([
    "function owner() view returns (address)",
    "function pause()",
    "function setFrozen(bytes32 poolId, bool frozen)",
  ]);
  const terms = parseAbi([
    "struct Listing { bool listed; bool frozen; uint8 tier; uint16 maxLtvBps; uint16 ltStartBps; uint16 ltTargetBps; uint40 rampStart; uint40 rampDuration; uint16 liquidatorBonusBps; uint16 removeHaircutBps; uint128 debtCapUsdg; uint128 minPositionUsd; }",
    "struct ListingParams { uint16 maxLtvBps; uint16 ltBps; uint16 liquidatorBonusBps; uint16 removeHaircutBps; uint128 debtCapUsdg; uint128 minPositionUsd; }",
    "function listingOf(bytes32 poolId) view returns (Listing)",
    "function updateTerms(bytes32 poolId, ListingParams params)",
  ]);
  const recorder = parseAbi([
    "function record((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key)",
    "function consult(bytes32 poolId) view returns (int24)",
  ]);

  /** Runs every test inside a snapshot, so each starts from the state the harness left. */
  function isolateEachTest() {
    let snapshot: Hex;
    beforeEach(async () => {
      snapshot = await anvil.snapshot();
    });
    afterEach(async () => {
      await anvil.revert({ id: snapshot });
    });
  }

  /** A wallet nobody has used, with gas money, and the clients the actions take. */
  async function newUser(label: string): Promise<{ address: Address; clients: Clients }> {
    const account = privateKeyToAccount(userKey(label));
    await fund(account.address);
    const walletClient = createWalletClient({ account, chain: robinhood, transport, pollingInterval });
    return { address: account.address, clients: { publicClient, walletClient } };
  }

  /** Sets a wallet's USDG balance. */
  async function dealUsdg(to: Address, amount: bigint) {
    await anvil.request({
      // Not in viem's anvil types yet.
      method: "anvil_dealERC20" as never,
      params: [to, USDG, `0x${amount.toString(16)}`] as never,
    });
  }

  /** Approves `spender` for `amount` of the wallet's USDG, outside any action. */
  async function approveUsdg({ walletClient }: Clients, spender: Address, amount: bigint) {
    await mined(await walletClient.writeContract({ address: USDG, abi: erc20Abi, functionName: "approve", args: [spender, amount] }));
  }

  const usdgBalance = (owner: Address) =>
    publicClient.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [owner] });

  const usdgAllowance = (owner: Address, spender: Address) =>
    publicClient.readContract({ address: USDG, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });

  const ownerOf = (tokenId: bigint) =>
    publicClient.readContract({ address: POSITION_MANAGER, abi: nft, functionName: "ownerOf", args: [tokenId] });

  /**
   * Gas money for `address`, read back before it is relied on. In one run anvil refused a
   * transfer for insufficient funds right after the holder's balance had been set; why is
   * not established. The balance is set until it reads as set.
   */
  async function fund(address: Address) {
    const value = parseEther("10");
    for (let attempt = 0; attempt < 5; attempt++) {
      await anvil.setBalance({ address, value });
      if ((await publicClient.getBalance({ address })) >= value) return;
    }
    throw new Error(`harness: the balance of ${address} does not read as set`);
  }

  async function as<T>(address: Address, run: () => Promise<T>): Promise<T> {
    await fund(address);
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
  async function givePosition(to: Address, tokenId: bigint) {
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

  const liquidityOf = (tokenId: bigint) =>
    publicClient.readContract({ address: POSITION_MANAGER, abi: nft, functionName: "getPositionLiquidity", args: [tokenId] });

  /**
   * Removes all of a position's liquidity through PositionManager, the way its
   * owner does on Uniswap: `DECREASE_LIQUIDITY` then `TAKE_PAIR`. The NFT stays
   * in the wallet, holding nothing.
   */
  async function emptyPosition({ walletClient }: Clients, tokenId: bigint) {
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
  async function pause(market: Address) {
    const { guardian } = manifest;
    await as(guardian, async () => {
      await mined(await anvil.writeContract({ account: guardian, address: market, abi: ownerActions, functionName: "pause" }));
    });
  }

  /** Freezes a pool as the policy's owner, whoever that is at the fork's block, impersonated. */
  async function freeze(poolId: Hex) {
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

  /**
   * Rewrites some of a pool's terms as the policy's owner, impersonated, leaving the others as
   * they are. It takes effect at once for the loans there are (spec §6.5).
   */
  async function updateTerms(poolId: Hex, change: { ltBps?: number; minPositionUsd?: bigint }) {
    const policy = deployment.collateralPolicy;
    const [owner, listing] = await Promise.all([
      publicClient.readContract({ address: policy, abi: ownerActions, functionName: "owner" }),
      publicClient.readContract({ address: policy, abi: terms, functionName: "listingOf", args: [poolId] }),
    ]);
    const { maxLtvBps, ltTargetBps, liquidatorBonusBps, removeHaircutBps, debtCapUsdg, minPositionUsd } = listing;
    const params = { maxLtvBps, ltBps: ltTargetBps, liquidatorBonusBps, removeHaircutBps, debtCapUsdg, minPositionUsd, ...change };
    await as(owner, async () => {
      await mined(
        await anvil.writeContract({ account: owner, address: policy, abi: terms, functionName: "updateTerms", args: [poolId, params] }),
      );
    });
  }

  /** Lowers a pool's liquidation threshold. */
  const lowerLiquidationThreshold = (poolId: Hex, ltBps: number) => updateTerms(poolId, { ltBps });

  /**
   * Moves a pool's price by `ticks` (one tick is 0.01%) without a swap: the pool's `slot0` in
   * PoolManager is rewritten with the price and the tick that far on. What a position is worth
   * in each token follows, which is all the tests ask of it; the liquidity in range is left as
   * it was, so this is not a price a swap would have reached through other positions' ticks.
   *
   * `slot0` is the first word of `pools[poolId]`, and `pools` is PoolManager's slot 6
   * (`StateLibrary.POOLS_SLOT`). The price is its low 160 bits and the tick the 24 above them.
   */
  async function movePoolPrice(poolId: Hex, ticks: number) {
    const poolManager = await publicClient.readContract({ address: POSITION_MANAGER, abi: nft, functionName: "poolManager" });
    const slot = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [poolId, 6n]));
    const word = hexToBigInt((await publicClient.getStorageAt({ address: poolManager, slot }))!);

    const PRICE = (1n << 160n) - 1n;
    const TICK = (1n << 24n) - 1n;
    const sqrtPriceX96 = word & PRICE;
    const tick = BigInt.asIntN(24, (word >> 160n) & TICK);
    if (sqrtPriceX96 === 0n) throw new Error(`harness: pool ${poolId} has no price in PoolManager's slot ${slot}`);

    // sqrt(1.0001^ticks), to twelve digits.
    const factor = BigInt(Math.round(1.0001 ** (ticks / 2) * 1e12));
    const moved = (sqrtPriceX96 * factor) / 10n ** 12n;
    const rest = word & ~(PRICE | (TICK << 160n));
    const value = rest | (BigInt.asUintN(24, tick + BigInt(ticks)) << 160n) | moved;
    await anvil.setStorageAt({ address: poolManager, index: slot, value: numberToHex(value, { size: 32 }) });
    await anvil.mine({ blocks: 1 });
  }

  /** Records a pool's price in `TwapRecorder`, as the keeper does every five minutes. Anyone may. */
  async function recordPrice(key: PoolKey) {
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
  const hasAveragePrice = (poolId: Hex) =>
    publicClient
      .readContract({ address: TWAP_RECORDER, abi: recorder, functionName: "consult", args: [poolId] })
      .then(
        () => true,
        () => false,
      );

  /** Lets `seconds` pass and mines a block, so interest has something to accrue over. */
  async function wait(seconds: number) {
    await anvil.increaseTime({ seconds });
    await anvil.mine({ blocks: 1 });
  }

  const nonceOf = (address: Address) => publicClient.getTransactionCount({ address });

  const sharesOf = (market: Address, owner: Address) =>
    publicClient.readContract({ address: market, abi: marketAbi, functionName: "balanceOf", args: [owner] });

  const totalAssets = (market: Address) =>
    publicClient.readContract({ address: market, abi: marketAbi, functionName: "totalAssets" });

  const debtOf = (market: Address, tokenId: bigint) =>
    publicClient.readContract({ address: market, abi: marketAbi, functionName: "debtOf", args: [tokenId] });

  return {
    deployment,
    blueChip,
    meme,
    anvil,
    publicClient,
    isolateEachTest,
    newUser,
    dealUsdg,
    approveUsdg,
    usdgBalance,
    usdgAllowance,
    ownerOf,
    givePosition,
    liquidityOf,
    emptyPosition,
    pause,
    freeze,
    lowerLiquidationThreshold,
    updateTerms,
    movePoolPrice,
    recordPrice,
    hasAveragePrice,
    wait,
    nonceOf,
    sharesOf,
    totalAssets,
    debtOf,
  };
}

/** The run's fork, at FORK_BLOCK. */
export const {
  deployment,
  blueChip,
  meme,
  anvil,
  publicClient,
  isolateEachTest,
  newUser,
  dealUsdg,
  approveUsdg,
  usdgBalance,
  usdgAllowance,
  ownerOf,
  givePosition,
  liquidityOf,
  emptyPosition,
  pause,
  freeze,
  lowerLiquidationThreshold,
  updateTerms,
  movePoolPrice,
  recordPrice,
  hasAveragePrice,
  wait,
  nonceOf,
  sharesOf,
  totalAssets,
  debtOf,
} = harnessOn(inject("forkUrl"), inject("manifest"));
