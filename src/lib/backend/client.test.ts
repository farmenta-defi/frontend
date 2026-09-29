import { afterEach, describe, expect, it, vi } from "vitest";

import { apiUrl, BackendError, failureMessage, fetchListedPools, fetchMarkets, fetchPool } from "./client";
import markets from "./fixtures/markets.json";
import poolEthUsdg from "./fixtures/pool-eth-usdg.json";
import poolNotListed from "./fixtures/pool-not-listed.json";
import poolsMeme from "./fixtures/pools-meme.json";
import rangeRefused from "./fixtures/range-refused.json";
import tierNotConfigured from "./fixtures/tier-not-configured.json";

const BASE = "https://api.example";
const ETH_USDG = "0xbac3aa3b91584a53a579b3c999a56756e954e59247e497bad1d25a4334bde551";
const OLD_ETH_USDG = "0x54f7883914619af9105355bf83ed678bcf9f63560218ac61c9963b9503d0ba32";

/** A backend that answers every request with one recorded body. */
function answering(body: unknown, status = 200) {
  const requests: string[] = [];
  const fetch = vi.fn(async (url: string | URL | Request) => {
    requests.push(String(url));
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, requests };
}

async function failure(request: Promise<unknown>) {
  const error = await request.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error, "the request went through").toBeInstanceOf(BackendError);
  return error as BackendError;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the backend's routes", () => {
  describe("positive", () => {
    it("asks for the markets over a range and reads the recorded answer", async () => {
      const { fetch, requests } = answering(markets);

      const figures = await fetchMarkets("1m", { baseUrl: BASE, fetch });

      expect(requests).toEqual([`${BASE}/markets?range=1m`]);
      expect(figures.map((market) => market.tier)).toEqual(["blue-chip", "meme"]);
    });

    it("asks for a market's pools under the app's tier name, which the backend takes", async () => {
      const { fetch, requests } = answering(poolsMeme);

      const pools = await fetchListedPools("meme", { baseUrl: BASE, fetch });

      expect(requests).toEqual([`${BASE}/markets/meme/pools`]);
      expect(pools).toHaveLength(3);
      expect(pools.every((pool) => pool.tier === "meme")).toBe(true);
    });

    it("asks for one pool by its id and reads the recorded answer", async () => {
      const { fetch, requests } = answering(poolEthUsdg);

      const pool = await fetchPool(ETH_USDG, "1w", { baseUrl: BASE, fetch });

      expect(requests).toEqual([`${BASE}/pools/${ETH_USDG}?range=1w`]);
      expect(pool.terms).toMatchObject({ maxLtvPct: 65, liquidationThresholdPct: 75 });
    });

    it("takes the address from NEXT_PUBLIC_API_URL, with or without a trailing slash", async () => {
      vi.stubEnv("NEXT_PUBLIC_API_URL", ` ${BASE}/ `);
      const { fetch, requests } = answering(markets);

      await fetchMarkets("1w", { fetch });

      expect(apiUrl()).toBe(BASE);
      expect(requests).toEqual([`${BASE}/markets?range=1w`]);
    });
  });

  describe("negative", () => {
    it("reports a pool the backend does not list, as recorded for the old ETH/USDG pool", async () => {
      const { fetch } = answering(poolNotListed, 404);

      const error = await failure(fetchPool(OLD_ETH_USDG, "1w", { baseUrl: BASE, fetch }));

      expect(error).toMatchObject({ kind: "not-found", status: 404 });
    });

    it("reports a tier the backend does not have, as recorded", async () => {
      const { fetch } = answering(tierNotConfigured, 404);

      expect(await failure(fetchListedPools("meme", { baseUrl: BASE, fetch }))).toMatchObject({ kind: "not-found" });
    });

    it("reports a refused request as an answer the app cannot use, as recorded for a range the backend has not", async () => {
      const { fetch } = answering(rangeRefused, 400);

      expect(await failure(fetchMarkets("1w", { baseUrl: BASE, fetch }))).toMatchObject({ kind: "invalid", status: 400 });
    });

    it("reports a backend that is up and cannot answer", async () => {
      // Not recorded: the live backend was not behind when the answers were taken.
      for (const status of [500, 502, 503]) {
        const { fetch } = answering({ statusCode: status }, status);

        expect(await failure(fetchMarkets("1w", { baseUrl: BASE, fetch }))).toMatchObject({ kind: "unavailable", status });
      }
    });

    it("reports a backend that does not answer", async () => {
      const fetch = vi.fn(async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof globalThis.fetch;

      const error = await failure(fetchMarkets("1w", { baseUrl: BASE, fetch }));

      expect(error).toMatchObject({ kind: "unreachable", status: null });
    });

    it("reports an answer in another shape instead of showing it", async () => {
      const { fetch } = answering(markets);

      expect(await failure(fetchPool(ETH_USDG, "1w", { baseUrl: BASE, fetch }))).toMatchObject({ kind: "invalid" });
    });
  });

  describe("edge case", () => {
    it("asks nothing when the build was given no backend", async () => {
      vi.stubEnv("NEXT_PUBLIC_API_URL", "");
      const { fetch, requests } = answering(markets);

      const error = await failure(fetchMarkets("1w", { fetch }));

      expect(apiUrl()).toBeNull();
      expect(error.kind).toBe("not-configured");
      expect(requests).toEqual([]);
    });

    it("reports an answer that is not JSON", async () => {
      const fetch = vi.fn(async () => new Response("<html>Bad gateway</html>", { status: 200 })) as unknown as typeof globalThis.fetch;

      expect(await failure(fetchMarkets("1w", { baseUrl: BASE, fetch }))).toMatchObject({ kind: "invalid" });
    });

    it("lets a request that was cancelled fail as cancelled, not as the backend's failure", async () => {
      const controller = new AbortController();
      const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
        controller.abort();
        throw init?.signal?.reason ?? new Error("aborted");
      }) as unknown as typeof globalThis.fetch;

      const error = await fetchMarkets("1w", { baseUrl: BASE, fetch, signal: controller.signal }).then(
        () => null,
        (thrown: unknown) => thrown,
      );

      expect(error).not.toBeNull();
      expect(error).not.toBeInstanceOf(BackendError);
    });
  });
});

describe("failureMessage", () => {
  describe("positive", () => {
    it("says why there are no figures, one sentence per reason", () => {
      const messages = (["not-configured", "unreachable", "unavailable", "not-found", "invalid"] as const).map((kind) =>
        failureMessage(new BackendError(kind, kind)),
      );

      expect(new Set(messages).size).toBe(5);
      expect(failureMessage(new BackendError("unavailable", "", 503))).toMatch(/catching up with the chain/);
    });
  });

  describe("negative", () => {
    it("never offers a figure in place of the one that did not come", () => {
      for (const kind of ["not-configured", "unreachable", "unavailable", "not-found", "invalid"] as const) {
        expect(failureMessage(new BackendError(kind, kind))).not.toMatch(/\d/);
      }
    });
  });

  describe("edge case", () => {
    it("says that the on-chain actions still work, whatever failed", () => {
      for (const error of [new BackendError("unavailable", "", 503), new TypeError("fetch failed"), undefined]) {
        expect(failureMessage(error)).toMatch(/still work/);
      }
    });
  });
});
