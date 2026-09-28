import { describe, expect, it } from "vitest";

import { listState, unreadNote } from "./list-status";

const read = { isLoading: false, isError: false, hasData: true };
const list = (over: Partial<Parameters<typeof listState>[0]> = {}) =>
  listState({ discovery: read, found: 2, shown: 2, reading: 0, failed: 0, ...over });

describe("listState", () => {
  describe("positive", () => {
    it("is ready once the positions found are on screen", () => {
      expect(list()).toEqual({ status: "ready", unread: 0 });
    });

    it("is loading on the first read of the logs, and on the first read of what they found", () => {
      const first = { isLoading: true, isError: false, hasData: false };
      expect(list({ discovery: first, found: 0, shown: 0 }).status).toBe("loading");
      expect(list({ shown: 0, reading: 2 }).status).toBe("loading");
    });
  });

  describe("negative", () => {
    it("does not go back to loading while the list is read again", () => {
      // A refetch on focus: the query is fetching, not loading, and the data is still there.
      expect(list({ discovery: { ...read, isLoading: false } }).status).toBe("ready");
    });

    it("does not go back to loading when a position has just arrived and is being read", () => {
      expect(list({ found: 3, shown: 2, reading: 1 })).toEqual({ status: "ready", unread: 0 });
    });

    it("reports logs that could not be read as failed, not as a wallet without positions", () => {
      const failed = { isLoading: false, isError: true, hasData: false };
      expect(list({ discovery: failed, found: 0, shown: 0 }).status).toBe("failed");
    });
  });

  describe("edge case", () => {
    it("is ready and empty for a wallet without positions", () => {
      expect(list({ found: 0, shown: 0 })).toEqual({ status: "ready", unread: 0 });
    });

    it("counts a position that was found and could not be read, instead of leaving it out in silence", () => {
      expect(list({ found: 2, shown: 1, failed: 1 })).toEqual({ status: "ready", unread: 1 });
    });

    it("is ready, not loading for ever, when every read failed", () => {
      expect(list({ found: 2, shown: 0, reading: 0, failed: 2 })).toEqual({ status: "ready", unread: 2 });
    });

    it("keeps the failure of the logs over a list read earlier", () => {
      expect(list({ discovery: { isLoading: false, isError: true, hasData: true } }).status).toBe("failed");
    });

    it("is idle without a wallet or a deployment: nothing was asked", () => {
      const idle = { isLoading: false, isError: false, hasData: false };
      expect(list({ discovery: idle, found: 0, shown: 0 })).toEqual({ status: "idle", unread: 0 });
    });
  });
});

describe("unreadNote", () => {
  describe("positive", () => {
    it("says how many positions are missing from the list", () => {
      expect(unreadNote(1)).toBe("Couldn't load one of your positions. It is tried again every 15 seconds.");
      expect(unreadNote(3)).toMatch(/^Couldn't load 3 of your positions\./);
    });
  });

  describe("negative", () => {
    it("says nothing when every position was read", () => {
      expect(unreadNote(0)).toBeNull();
    });
  });

  describe("edge case", () => {
    it("names the number for two, the smallest plural", () => {
      expect(unreadNote(2)).toMatch(/2 of your positions/);
    });
  });
});
