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
import { ActionError, explainError, explainForPool, explainRevertData, toActionError } from "./errors";

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
        ["PoolDebtCapExceeded", [POOL, 501_000_000_000n, 500_000_000_000n], /500,000 USDG.*501,000 USDG/],
        ["MarketDebtCapExceeded", [501_000_000_000n, 500_000_000_000n], /500,000 USDG.*501,000 USDG/],
        ["UsdgPriceOutOfBounds", [960_000_000_000_000_000n], /\$0\.96/],
        ["StalePrice", [zeroAddress, 1_700_000_000n], /price feed/],
        ["OutstandingDebt", [123n, 5n], /Repay the loan in full/],
        ["PermitRejected", [123n], /signature/i],
        ["PositionBelowMinimum", [4n * 10n ** 18n, 5n * 10n ** 18n], /\$4.*\$5/],
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

describe("explainRevertData", () => {
  const data = (errorName: string, args: readonly unknown[] = []) =>
    encodeErrorResult({ abi: farmentaErrorsAbi as Abi, errorName, args });

  describe("positive", () => {
    it("reads the error a call reverted with inside a batch", () => {
      expect(explainRevertData(data("MemeTwapUnavailable", [POOL]))).toMatchObject({ code: "MemeTwapUnavailable" });
      expect(explainRevertData(data("StalePrice", [zeroAddress, 1_700_000_000n]))).toEqual(
        explainError(revertWith("StalePrice", [zeroAddress, 1_700_000_000n])),
      );
    });
  });

  describe("negative", () => {
    it("does not invent a reason for data it cannot decode", () => {
      expect(explainRevertData("0xdeadbeef")).toEqual({ code: "UnknownRevert", message: "The call would fail (0xdeadbeef)." });
    });
  });

  describe("edge case", () => {
    it("reads a revert without data", () => {
      expect(explainRevertData("0x")).toEqual({ code: "UnknownRevert", message: "The call would fail." });
    });
  });
});

describe("explainForPool", () => {
  const stale = explainError(revertWith("StalePrice", [zeroAddress, 1_700_000_000n]));
  const noAverage = explainError(revertWith("MemeTwapUnavailable", [POOL]));
  const stock = { base: { symbol: "NVDA" }, feedHours: "us-stock-market" } as const;
  const crypto = { base: { symbol: "ETH" }, feedHours: "always" } as const;
  const meme = { base: { symbol: "PONS" }, feedHours: "always" } as const;

  describe("positive", () => {
    it("says of a stock's stale price that the stock market is closed, and when the pool opens again", () => {
      const explained = explainForPool(stale, stock);

      expect(explained.code).toBe("StalePrice");
      expect(explained.message).toMatch(/NVDA/);
      expect(explained.message).toMatch(/stock market is closed/);
      expect(explained.message).toMatch(/open again when the stock market does/);
      expect(explained.message).toMatch(/Repaying works at any time/);
    });

    it("says of a meme pool without an average price that its price has to be recorded for 30 minutes", () => {
      const explained = explainForPool(noAverage, meme);

      expect(explained.code).toBe("MemeTwapUnavailable");
      expect(explained.message).toMatch(/recorded for 30 minutes/);
    });
  });

  describe("negative", () => {
    it("does not tell the holder of a stock to try again in a moment: the feed is quiet until the market opens", () => {
      expect(stale.message).toMatch(/Try again in a moment/);
      expect(explainForPool(stale, stock).message).not.toMatch(/Try again in a moment/);
    });

    it("leaves a stale price alone where the feed runs around the clock", () => {
      expect(explainForPool(stale, crypto)).toEqual(stale);
      expect(explainForPool(stale, meme)).toEqual(stale);
    });
  });

  describe("edge case", () => {
    it("leaves every other error of a stock pool alone", () => {
      for (const name of ["EnforcedPause", "PermitRejected", "InvalidRecipient"]) {
        const explained = explainError(revertWith(name, name === "PermitRejected" ? [1n] : []));
        expect(explainForPool(explained, stock), name).toEqual(explained);
      }
    });

    it("leaves the error alone where the pool is not known", () => {
      expect(explainForPool(stale, null)).toEqual(stale);
      expect(explainForPool(stale, undefined)).toEqual(stale);
    });
  });
});
