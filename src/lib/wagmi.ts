import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { fallback, http } from "wagmi";

import { chain } from "./chain";

/**
 * WalletConnect Cloud project id (free at https://cloud.reown.com).
 * Injected wallets (MetaMask, Rabby, …) work without it; WalletConnect
 * QR connections need a real id.
 *
 * `||`, not `??`: copying `.env.example` leaves the variable set to an empty
 * string, which has to read the same as leaving it out.
 */
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || "FARMENTA_DEV_PLACEHOLDER";

/**
 * Optional RPC override (e.g. an Alchemy endpoint). Falls back to the
 * official public RPC baked into the viem chain definition. Note: some ISPs
 * DNS-hijack rpc.mainnet.chain.robinhood.com; a provider RPC avoids that.
 */
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL?.trim() || undefined;

export const config = getDefaultConfig({
  appName: "Farmenta",
  projectId,
  chains: [chain],
  transports: {
    [chain.id]: rpcUrl ? fallback([http(rpcUrl), http()]) : http(),
  },
  ssr: true,
});
