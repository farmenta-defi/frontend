import { describe, expect, it } from "vitest";

import { parseTokenId, readTracked, track, untrack, type PositionStorage } from "./tracked-positions";

const ALICE = "0x00000000000000000000000000000000000A11CE";
const BOB = "0x0000000000000000000000000000000000000B0B";

function memory(initial: Record<string, string> = {}): PositionStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe("tracked positions", () => {
  describe("positive", () => {
    it("remembers the ids a wallet added, in the order it added them", () => {
      const storage = memory();
      track(storage, 4663, ALICE, 1_768_881n);
      track(storage, 4663, ALICE, 999_597n);

      expect(readTracked(storage, 4663, ALICE)).toEqual([1_768_881n, 999_597n]);
    });

    it("forgets one when asked to", () => {
      const storage = memory();
      track(storage, 4663, ALICE, 1_768_881n);
      track(storage, 4663, ALICE, 999_597n);

      expect(untrack(storage, 4663, ALICE, 1_768_881n)).toEqual([999_597n]);
      expect(readTracked(storage, 4663, ALICE)).toEqual([999_597n]);
    });

    it("reads a token id the way a user writes one", () => {
      expect(parseTokenId("1768881")).toBe(1_768_881n);
      expect(parseTokenId(" #1768881 ")).toBe(1_768_881n);
    });
  });

  describe("negative", () => {
    it("keeps one wallet's list from another's, and one chain's from another's", () => {
      const storage = memory();
      track(storage, 4663, ALICE, 1_768_881n);

      expect(readTracked(storage, 4663, BOB)).toEqual([]);
      expect(readTracked(storage, 1, ALICE)).toEqual([]);
    });

    it("refuses what is not a token id", () => {
      for (const input of ["", "abc", "-1", "1.5", "0x10", "1e6", "0", "12 34"]) {
        expect(parseTokenId(input), input).toBeNull();
      }
    });
  });

  describe("edge case", () => {
    it("does not list an id twice", () => {
      const storage = memory();
      track(storage, 4663, ALICE, 1_768_881n);
      track(storage, 4663, ALICE, 1_768_881n);

      expect(readTracked(storage, 4663, ALICE)).toEqual([1_768_881n]);
    });

    it("finds the list under either case of the address", () => {
      const storage = memory();
      track(storage, 4663, ALICE, 1_768_881n);

      expect(readTracked(storage, 4663, ALICE.toLowerCase() as `0x${string}`)).toEqual([1_768_881n]);
    });

    it("starts from nothing when the stored value is damaged", () => {
      const key = `farmenta:positions:4663:${ALICE.toLowerCase()}`;

      expect(readTracked(memory({ [key]: "{not json" }), 4663, ALICE)).toEqual([]);
      expect(readTracked(memory({ [key]: '{"a":1}' }), 4663, ALICE)).toEqual([]);
      expect(readTracked(memory({ [key]: '["12", 7, "x", null, "12"]' }), 4663, ALICE)).toEqual([12n]);
    });

    it("survives a storage that refuses to write", () => {
      const storage: PositionStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      };

      expect(track(storage, 4663, ALICE, 5n)).toEqual([5n]);
    });

    it("takes the largest uint256 and nothing above it", () => {
      expect(parseTokenId((2n ** 256n - 1n).toString())).toBe(2n ** 256n - 1n);
      expect(parseTokenId((2n ** 256n).toString())).toBeNull();
    });
  });
});
