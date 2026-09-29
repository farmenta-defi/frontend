import { describe, expect, it } from "vitest";

import { BackendError } from "./client";
import { figuresOf } from "./hooks";

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
