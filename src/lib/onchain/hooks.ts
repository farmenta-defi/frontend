"use client";

import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { createPublicClient, http, type Address, type Hex, type TransactionReceipt } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";

import { chain } from "@/lib/chain";
import { deployment } from "@/lib/deployment";
import { chainKeys, invalidateAfterTransaction } from "@/lib/query-keys";
import type { MarketTier } from "@/lib/risk-params";

import type { Progress, Step } from "./actions";
import { discoverPositions, POSITION_MANAGER_START_BLOCK } from "./discovery";
import { explainError, type Explained } from "./errors";
import { sessionGate, type Gate } from "./gates";
import { readLenderState, readPosition, type Clients, type MarketRefs, type ReadClient } from "./reads";

/**
 * The React side of the on-chain actions: who is connected and whether they
 * may act, the states read from the chain, and running an action.
 *
 * Reads are pinned to chain 4663 whatever network the wallet is on, so a
 * wallet elsewhere still sees its figures; it cannot act until it switches.
 */
const REFRESH_MS = 15_000;

/** The contracts of one market, or `null` when no deployment is configured. */
export function marketRefs(tier: MarketTier): MarketRefs | null {
  if (!deployment) return null;
  return { ...deployment.markets[tier], policy: deployment.collateralPolicy };
}

export type Session = {
  account: Address | undefined;
  /** Open when a deployment is configured and a wallet is connected on chain 4663. */
  gate: Gate;
  /** Present exactly when `gate` is open and the wallet has answered. */
  clients: Clients | null;
  publicClient: ReadClient | null;
  /** Asks the wallet to switch to chain 4663. */
  switchNetwork: () => void;
};

export function useSession(): Session {
  const { address: account, chainId: walletChainId } = useAccount();
  const publicClient = (usePublicClient({ chainId: chain.id }) ?? null) as ReadClient | null;
  const { data: walletClient } = useWalletClient({ chainId: chain.id });
  const { switchChain } = useSwitchChain();

  const gate = sessionGate({
    deployed: deployment !== null,
    account,
    walletChainId,
    chainId: chain.id,
    chainName: chain.name,
  });
  const clients = useMemo(
    () =>
      gate.ok && publicClient && walletClient
        ? ({ publicClient, walletClient } as unknown as Clients)
        : null,
    [gate.ok, publicClient, walletClient],
  );
  const switchNetwork = useCallback(() => switchChain({ chainId: chain.id }), [switchChain]);

  return { account, gate, clients, publicClient, switchNetwork };
}

export function useLenderState(tier: MarketTier) {
  const { account, publicClient } = useSession();
  const refs = marketRefs(tier);
  const enabled = Boolean(refs && account && publicClient);

  return useQuery({
    queryKey: chainKeys.lender(tier, account ?? "0x"),
    queryFn: () => readLenderState(publicClient!, refs!.market, account!),
    enabled,
    refetchInterval: REFRESH_MS,
  });
}

const positionQuery = (
  tier: MarketTier,
  tokenId: bigint,
  account: Address | undefined,
  publicClient: ReadClient | null,
) => {
  const refs = marketRefs(tier);
  return {
    queryKey: chainKeys.position(tier, tokenId, account ?? "0x"),
    queryFn: () => readPosition(publicClient!, refs!, tokenId, account!),
    enabled: Boolean(refs && account && publicClient),
    refetchInterval: REFRESH_MS,
  };
};

export function usePosition(tier: MarketTier, tokenId: bigint | null) {
  const { account, publicClient } = useSession();
  const query = positionQuery(tier, tokenId ?? 0n, account, publicClient);
  return useQuery({ ...query, enabled: query.enabled && tokenId !== null });
}

export function usePositions(tier: MarketTier, tokenIds: readonly bigint[]) {
  const { account, publicClient } = useSession();
  return useQueries({ queries: tokenIds.map((tokenId) => positionQuery(tier, tokenId, account, publicClient)) });
}

/* ------------------------------------------------------------------ */
/* The wallet's positions                                              */
/* ------------------------------------------------------------------ */

/**
 * The client that reads the logs. Not the app's RPC override: a free-tier
 * provider key refuses a log range of more than 10 blocks, and the range here
 * runs from PositionManager's deployment to now. The chain's public RPC
 * serves it. It answers a burst with HTTP 429, so a request is tried three
 * times with a pause before the list reports that it could not be read.
 *
 * `NEXT_PUBLIC_LOGS_RPC_URL` and `NEXT_PUBLIC_LOGS_FROM_BLOCK` exist for
 * `pnpm fork`, whose logs are on the fork and start at its block.
 */
const logsClient = createPublicClient({
  chain,
  transport: http(process.env.NEXT_PUBLIC_LOGS_RPC_URL?.trim() || chain.rpcUrls.default.http[0], {
    retryCount: 2,
    retryDelay: 750,
    timeout: 4_000,
  }),
}) as ReadClient;

const logsFromBlock = /^\d+$/.test(process.env.NEXT_PUBLIC_LOGS_FROM_BLOCK?.trim() ?? "")
  ? BigInt(process.env.NEXT_PUBLIC_LOGS_FROM_BLOCK!.trim())
  : POSITION_MANAGER_START_BLOCK;

/**
 * The positions the connected wallet holds or has deposited, found in the
 * chain's logs. `isError` means the logs could not be read, which is not the
 * same as the wallet having none; `refetch` tries again.
 */
export function useWalletPositions() {
  const { account, publicClient } = useSession();
  const enabled = Boolean(deployment && account && publicClient);

  return useQuery({
    queryKey: chainKeys.positions(account ?? "0x"),
    queryFn: () =>
      discoverPositions(
        { logs: logsClient, reads: publicClient! },
        { "blue-chip": marketRefs("blue-chip")!, meme: marketRefs("meme")! },
        account!,
        logsFromBlock,
      ),
    enabled,
    // The transport has already tried three times.
    retry: false,
    staleTime: 60_000,
  });
}

/* ------------------------------------------------------------------ */
/* Running an action                                                   */
/* ------------------------------------------------------------------ */

export type ActionState =
  | { status: "idle" }
  | { status: "running"; step: Step | null }
  | { status: "done"; hash: Hex; summary: string }
  | { status: "failed"; error: Explained };

export type Run = (
  summary: string,
  action: (clients: Clients, refs: MarketRefs, onStep: Progress) => Promise<TransactionReceipt>,
  poolId?: Hex | null,
) => Promise<TransactionReceipt | null>;

/**
 * Runs one action at a time for a market and reports where it is. After the
 * receipt, what the transaction can have changed is refetched: the chain's
 * reads at once, the backend's queries by invalidation.
 */
export function useAction(tier: MarketTier) {
  const { clients, account } = useSession();
  const queryClient = useQueryClient();
  const [state, setState] = useState<ActionState>({ status: "idle" });

  const run = useCallback<Run>(
    async (summary, action, poolId) => {
      const refs = marketRefs(tier);
      if (!clients || !refs || !account) return null;

      setState({ status: "running", step: null });
      try {
        const receipt = await action(clients, refs, (step) => setState({ status: "running", step }));
        await invalidateAfterTransaction(queryClient, { tier, account, poolId });
        setState({ status: "done", hash: receipt.transactionHash, summary });
        return receipt;
      } catch (error) {
        setState({ status: "failed", error: explainError(error) });
        return null;
      }
    },
    [account, clients, queryClient, tier],
  );
  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, run, reset, busy: state.status === "running" };
}
