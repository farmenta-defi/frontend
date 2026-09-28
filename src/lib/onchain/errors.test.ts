import {
  ChainMismatchError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  parseAbi,
  TransactionExecutionError,
  UserRejectedRequestError,
  zeroAddress,
  type Abi,
} from "viem";
import { robinhood, mainnet } from "viem/chains";
import { describe, expect, it } from "vitest";

import { farmentaErrorsAbi } from "@/abis/FarmentaErrors";

import { marketAbi } from "./contracts";
import { ActionError, explainError, toActionError } from "./errors";

const POOL = "0x54f7883914619af9105355bf83ed678bcf9f63560218ac61c9963b9503d0ba32";

/** The error viem throws from `simulateContract` when the call reverts with `data`. */
function reverted(data: `0x${string}`, abi: Abi = marketAbi as Abi, functionName = "borrow", args: unknown[] = [1n, 1n, zeroAddress]) {
  const cause = new ContractFunctionRevertedError({ abi, data, functionName });
  return new ContractFunctionExecutionError(cause, { abi, functionName, args, contractAddress: zeroAddress });
}

const revertWith = (errorName: string, args: readonly unknown[] = []) =>
  reverted(encodeErrorResult({ abi: farmentaErrorsAbi as Abi, errorName, args }));

describe("explainError", () => {
  describe("positive", () => {
    it("names every error FAR-72 lists and says what to do about it", () => {
      const cases: [string, readonly unknown[], RegExp][] = [
        ["EnforcedPause", [], /paused/],
        ["PoolFrozenForNewPositions", [POOL], /frozen.*no new collateral/],
        ["PoolNotOpenForBorrowing", [POOL], /frozen.*no new loans/],
        ["BorrowExceedsMaxLtv", [700n * 10n ** 18n, 650n * 10n ** 18n], /\$700.*\$650/],
        ["BorrowBelowMinimum", [4_000_000n], /at least 10 USDG.*4 USDG/],
        ["PoolDebtCapExceeded", [POOL, 501_000_000_000n, 500_000_000_000n], /500,000 USDG.*501,000 USDG/],
        ["MarketDebtCapExceeded", [501_000_000_000n, 500_000_000_000n], /500,000 USDG.*501,000 USDG/],
        ["UsdgPriceOutOfBounds", [960_000_000_000_000_000n], /\$0\.96/],
        ["StalePrice", [zeroAddress, 1_700_000_000n], /price feed/],
        ["OutstandingDebt", [123n, 5n], /Repay the loan in full/],
        ["PermitRejected", [123n], /signature/i],
        ["PositionBelowMinimum", [40n * 10n ** 18n, 50n * 10n ** 18n], /\$40.*\$50/],
        ["ERC4626ExceededMaxWithdraw", [zeroAddress, 200_000_000n, 150_000_000n], /up to 150 USDG.*200 USDG/],
      ];
      for (const [name, args, expected] of cases) {
        const explained = explainError(revertWith(name, args));
        expect(explained.code, name).toBe(name);
        expect(explained.message, name).toMatch(expected);
      }
    });

    it("decodes an error the call's own ABI does not declare", () => {
      // A lens call reverting with the oracle's error, simulated with an ABI that lacks it.
      const bare = parseAbi(["function maxBorrow(uint256) view returns (uint256)"]);
      const data = encodeErrorResult({ abi: farmentaErrorsAbi as Abi, errorName: "StalePrice", args: [zeroAddress, 1n] });
      expect(explainError(reverted(data, bare, "maxBorrow", [1n])).code).toBe("StalePrice");
    });
  });

  describe("negative", () => {
    it("reports a wallet refusal as nothing sent, not as a failure of the contract", () => {
      const refusal = new TransactionExecutionError(new UserRejectedRequestError(new Error("User denied")), {
        account: null,
        chain: robinhood,
      });
      expect(explainError(refusal)).toEqual({
        code: "UserRejected",
        message: "You rejected the request in your wallet. Nothing was sent.",
      });
    });

    it("reports a wallet on another network", () => {
      const mismatch = new ChainMismatchError({ chain: robinhood, currentChainId: mainnet.id });
      const explained = explainError(mismatch);
      expect(explained.code).toBe("WrongNetwork");
      expect(explained.message).toMatch(/Switch to Robinhood Chain/);
    });

    it("does not invent a reason for a revert it cannot decode", () => {
      const explained = explainError(reverted("0xdeadbeef"));
      expect(explained.code).toBe("UnknownRevert");
      expect(explained.message).toContain("0xdeadbeef");
    });
  });

  describe("edge case", () => {
    it("passes a revert string through, which is how a token without custom errors reverts", () => {
      const data = encodeErrorResult({
        abi: parseAbi(["error Error(string)"]),
        errorName: "Error",
        args: ["insufficient funds"],
      });
      expect(explainError(reverted(data))).toEqual({
        code: "Error",
        message: "The transaction would fail: insufficient funds.",
      });
    });

    it("names a known error that has no sentence yet instead of hiding it", () => {
      expect(explainError(revertWith("ReentrancyGuardReentrantCall"))).toEqual({
        code: "ReentrancyGuardReentrantCall",
        message: "The transaction would fail (ReentrancyGuardReentrantCall).",
      });
    });

    it("survives something that is not an error at all", () => {
      expect(explainError("boom").code).toBe("Unknown");
      expect(explainError(undefined).code).toBe("Unknown");
    });

    it("keeps an ActionError as it is when asked to wrap it", () => {
      const refused = new ActionError({ code: "OutstandingDebt", message: "still owes" });
      expect(toActionError(refused)).toBe(refused);
      expect(explainError(refused)).toEqual({ code: "OutstandingDebt", message: "still owes" });
    });
  });
});
