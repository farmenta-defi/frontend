import { maxUint256, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import { previewLoan } from "./preview";
import type { PositionState } from "./reads";

const USDG = 1_000_000n;
const WAD = 10n ** 18n;

/**
 * A $1,000 position in a pool at 65% max LTV and 75% liquidation threshold,
 * with USDG at exactly $1 unless a test says otherwise. The lens's answers are
 * written out by hand from the contract's formulas:
 *   maxBorrow    = (value × maxLtv − debtUsd) / price
 *   healthFactor = value × lt / debtUsd
 */
const position = (over: Partial<PositionState> = {}): PositionState => ({
  tokenId: 1n,
  place: "collateral",
  poolId: "0x54f7883914619af9105355bf83ed678bcf9f63560218ac61c9963b9503d0ba32",
  poolKey: null,
  ticks: null,
  decimals: null,
  holdings: null,
  pool: { status: "open", terms: { maxLtvBps: 6500, ltBps: 7500 } },
  paused: false,
  debt: 0n,
  risk: { positionValue: 1_000n * WAD, maxBorrow: 650n * USDG, healthFactor: maxUint256 },
  riskError: null,
  asset: zeroAddress,
  balance: 0n,
  allowance: 0n,
  ...over,
});

/** The same position owing 300 USDG: HF = 1000 × 0.75 / 300 = 2.5, 350 left to borrow. */
const owing300 = (over: Partial<PositionState> = {}) =>
  position({
    debt: 300n * USDG,
    risk: { positionValue: 1_000n * WAD, maxBorrow: 350n * USDG, healthFactor: (25n * WAD) / 10n },
    ...over,
  });

describe("previewLoan", () => {
  describe("positive", () => {
    it("a first loan of 500 USDG against $1,000 is a 50% LTV at health factor 1.5", () => {
      const preview = previewLoan(position(), 500n * USDG)!;

      expect(preview.debt).toBe(500);
      expect(preview.collateralUsd).toBe(1000);
      expect(preview.ltv).toBeCloseTo(0.5, 10);
      expect(preview.healthFactor).toBeCloseTo(1.5, 10);
      expect(preview.liquidationLtv).toBe(0.75);
    });

    it("borrowing 200 more on a loan of 300 brings the health factor from 2.5 to 1.5", () => {
      expect(previewLoan(owing300(), 0n)!.healthFactor).toBeCloseTo(2.5, 10);
      expect(previewLoan(owing300(), 200n * USDG)!.healthFactor).toBeCloseTo(1.5, 10);
    });

    it("repaying 100 of 300 brings it to 3.75", () => {
      const preview = previewLoan(owing300(), -100n * USDG)!;

      expect(preview.debt).toBe(200);
      expect(preview.healthFactor).toBeCloseTo(3.75, 10);
    });
  });

  describe("negative", () => {
    it("has nothing to preview for a position that is not collateral, or cannot be priced", () => {
      expect(previewLoan(position({ place: "wallet", risk: null }), 100n * USDG)).toBeNull();
      expect(previewLoan(position({ risk: null, riskError: { code: "StalePrice", message: "stale" } }), 1n)).toBeNull();
    });
  });

  describe("edge case", () => {
    it("borrowing the whole of maxBorrow lands on the max LTV, at health factor 0.75 / 0.65", () => {
      const preview = previewLoan(position(), 650n * USDG)!;

      expect(preview.ltv).toBeCloseTo(0.65, 10);
      expect(preview.healthFactor).toBeCloseTo(0.75 / 0.65, 10);
    });

    it("prices the debt at the oracle's USDG price, not at one dollar", () => {
      // USDG at $1.02: $650 of room is 637.254901 USDG, and 500 USDG is $510 of debt.
      const dear = position({ risk: { positionValue: 1_000n * WAD, maxBorrow: 637_254_901n, healthFactor: maxUint256 } });
      const preview = previewLoan(dear, 500n * USDG)!;

      expect(preview.ltv).toBeCloseTo(0.51, 6);
      expect(preview.healthFactor).toBeCloseTo(750 / 510, 6);
    });

    it("repaying everything, or more, leaves no debt and nothing to liquidate", () => {
      for (const change of [-300n * USDG, -400n * USDG]) {
        const preview = previewLoan(owing300(), change)!;
        expect(preview.debt).toBe(0);
        expect(preview.ltv).toBe(0);
        expect(preview.healthFactor).toBe(Infinity);
      }
    });

    it("a position with no room left still previews, at one dollar per USDG", () => {
      const full = position({ risk: { positionValue: 1_000n * WAD, maxBorrow: 0n, healthFactor: maxUint256 } });

      expect(previewLoan(full, 100n * USDG)!.ltv).toBeCloseTo(0.1, 10);
    });
  });
});
