import { describe, expect, it } from "vitest";

import { activityPageOf, type ActivityPage } from "./activity";
import { BackendError } from "./client";
import pageOne from "./fixtures/activity-page-1.json";
import pageTwo from "./fixtures/activity-page-2.json";
import { figuresOf, historyOf } from "./hooks";
import { readActivity } from "./wire";

const down = new BackendError("unavailable", "the indexer is behind", 503);

describe("figuresOf", () => {
  describe("positive", () => {
    it("is ready with the figures once they came", () => {
      expect(figuresOf({ data: { tvl: 0 }, error: null, isError: false })).toEqual({
        status: "ready",
        data: { tvl: 0 },
        error: null,
      });
    });
  });

  describe("negative", () => {
    it("is failed, with no figures at all, when none ever came", () => {
      expect(figuresOf({ data: undefined, error: down, isError: true })).toEqual({
        status: "failed",
        data: null,
        error: down,
      });
    });
  });

  describe("edge case", () => {
    it("is loading before the first answer, which is neither zero nor a failure", () => {
      expect(figuresOf({ data: undefined, error: null, isError: false })).toEqual({
        status: "loading",
        data: null,
        error: null,
      });
    });

    it("keeps the figures on screen when a later reading fails, and says that it failed", () => {
      expect(figuresOf({ data: { tvl: 1_240_000 }, error: down, isError: true })).toEqual({
        status: "ready",
        data: { tvl: 1_240_000 },
        error: down,
      });
    });

    it("is ready with null for a market the backend answered without", () => {
      expect(figuresOf({ data: null, error: null, isError: false })).toEqual({ status: "ready", data: null, error: null });
    });
  });
});

describe("historyOf", () => {
  const first = activityPageOf(readActivity(pageOne)!)!;
  const second = activityPageOf(readActivity(pageTwo)!)!;
  const read = (pages: ActivityPage[], more: { error?: unknown; hasNextPage?: boolean } = {}) =>
    historyOf({
      data: { pages },
      error: more.error ?? null,
      isError: more.error !== undefined,
      hasNextPage: more.hasNextPage ?? false,
    });

  describe("positive", () => {
    it("is ready with the rows of the first page, and says there is more", () => {
      const history = read([first], { hasNextPage: true });

      expect(history).toMatchObject({ status: "ready", error: null, hasMore: true });
      expect(history.rows.map((row) => row.id)).toEqual(["76256790:2", "76256084:21"]);
    });

    it("is ready with every page read so far as one list, and says when that is all", () => {
      const history = read([first, second]);

      expect(history.hasMore).toBe(false);
      expect(history.rows.map((row) => row.id)).toEqual(["76256790:2", "76256084:21", "76253701:9"]);
    });
  });

  describe("negative", () => {
    it("is failed, with no rows, when the history never came", () => {
      expect(historyOf({ data: undefined, error: down, isError: true, hasNextPage: false })).toEqual({
        status: "failed",
        rows: [],
        error: down,
        hasMore: false,
      });
    });
  });

  describe("edge case", () => {
    it("is loading before the first answer, which is not a wallet with no transactions", () => {
      expect(historyOf({ data: undefined, error: null, isError: false, hasNextPage: false })).toEqual({
        status: "loading",
        rows: [],
        error: null,
        hasMore: false,
      });
    });

    it("is ready and empty for a wallet the backend has no transaction of", () => {
      expect(read([{ rows: [], next: null }])).toEqual({ status: "ready", rows: [], error: null, hasMore: false });
    });

    it("keeps the rows on screen when the next page or a refresh fails, says that it failed, and still offers the rest", () => {
      const history = read([first], { error: down, hasNextPage: true });

      expect(history).toMatchObject({ status: "ready", error: down, hasMore: true });
      expect(history.rows).toHaveLength(2);
    });
  });
});
