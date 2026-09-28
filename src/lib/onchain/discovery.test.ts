import { describe, expect, it } from "vitest";

import { placeOf, type TokenFacts } from "./discovery";

const ALICE = "0x00000000000000000000000000000000000A11CE";
const BOB = "0x0000000000000000000000000000000000000B0B";
const BLUE_CHIP = "0x00000000000000000000000000000000000000b1";
const MEME = "0x00000000000000000000000000000000000000b2";
const NOBODY = "0x0000000000000000000000000000000000000000";

/** A token as the chain describes it: no market records a loan for it unless a test says so. */
const token = (over: Partial<TokenFacts> = {}): TokenFacts => ({
  holder: ALICE,
  liquidity: 1_000n,
  loans: [
    { tier: "blue-chip", market: BLUE_CHIP, owner: NOBODY },
    { tier: "meme", market: MEME, owner: NOBODY },
  ],
  ...over,
});

const heldBy = (market: string, owner: string, liquidity = 1_000n) =>
  token({
    holder: market as `0x${string}`,
    liquidity,
    loans: [
      { tier: "blue-chip", market: BLUE_CHIP, owner: (market === BLUE_CHIP ? owner : NOBODY) as `0x${string}` },
      { tier: "meme", market: MEME, owner: (market === MEME ? owner : NOBODY) as `0x${string}` },
    ],
  });

describe("placeOf", () => {
  describe("positive", () => {
    it("a position the wallet holds, with liquidity, is in the wallet", () => {
      expect(placeOf(token(), ALICE)).toEqual({ place: "wallet", tier: null });
    });

    it("a position a market holds for the wallet is that market's collateral", () => {
      expect(placeOf(heldBy(BLUE_CHIP, ALICE), ALICE)).toEqual({ place: "collateral", tier: "blue-chip" });
      expect(placeOf(heldBy(MEME, ALICE), ALICE)).toEqual({ place: "collateral", tier: "meme" });
    });
  });

  describe("negative", () => {
    it("a position in the wallet that holds no liquidity is not listed", () => {
      expect(placeOf(token({ liquidity: 0n }), ALICE)).toBeNull();
    });

    it("someone else's position and someone else's collateral are not listed", () => {
      expect(placeOf(token({ holder: BOB }), ALICE)).toBeNull();
      expect(placeOf(heldBy(BLUE_CHIP, BOB), ALICE)).toBeNull();
    });
  });

  describe("edge case", () => {
    it("collateral that holds no liquidity is listed: its loan and its way out are still there", () => {
      expect(placeOf(heldBy(BLUE_CHIP, ALICE, 0n), ALICE)).toEqual({ place: "collateral", tier: "blue-chip" });
      expect(placeOf(heldBy(MEME, ALICE, 0n), ALICE)).toEqual({ place: "collateral", tier: "meme" });
    });

    it("a position a market holds without a loan recorded to anyone is not the wallet's", () => {
      // Minted or sent straight to the market: `loanOf` is a zeroed record.
      expect(placeOf(heldBy(BLUE_CHIP, NOBODY), ALICE)).toBeNull();
    });

    it("a loan recorded by one market does not make collateral of a token the other market holds", () => {
      const crossed = token({
        holder: MEME,
        loans: [
          { tier: "blue-chip", market: BLUE_CHIP, owner: ALICE },
          { tier: "meme", market: MEME, owner: NOBODY },
        ],
      });
      expect(placeOf(crossed, ALICE)).toBeNull();
    });

    it("compares addresses whatever their case", () => {
      const lower = ALICE.toLowerCase() as `0x${string}`;
      expect(placeOf(token({ holder: lower }), ALICE)).toEqual({ place: "wallet", tier: null });
      const held = token({
        holder: BLUE_CHIP.toUpperCase().replace("0X", "0x") as `0x${string}`,
        loans: [{ tier: "blue-chip", market: BLUE_CHIP, owner: lower }],
      });
      expect(placeOf(held, ALICE)).toEqual({ place: "collateral", tier: "blue-chip" });
    });

    it("a market whose read failed is left out, and the token is judged by the others", () => {
      const partial = token({ holder: MEME, loans: [{ tier: "meme", market: MEME, owner: ALICE }] });
      expect(placeOf(partial, ALICE)).toEqual({ place: "collateral", tier: "meme" });
    });
  });
});
