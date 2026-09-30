import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActivityRow } from "./activity";
import {
  ACTIVITY_PAGE_SIZE,
  apiUrl,
  BackendError,
  failureMessage,
  fetchActivity,
  fetchListedPools,
  fetchMarkets,
  fetchPool,
  fetchPoolActivity,
  historyFailureMessage,
} from "./client";
import activityAddressRefused from "./fixtures/activity-address-refused.json";
import activityCursorRefused from "./fixtures/activity-cursor-refused.json";
import activityNone from "./fixtures/activity-none.json";
import activityPageOne from "./fixtures/activity-page-1.json";
import activityPageTwo from "./fixtures/activity-page-2.json";
import markets from "./fixtures/markets.json";
import poolActivityBorrow from "./fixtures/pool-activity-eth-usdg-borrow.json";
import poolActivityEmpty from "./fixtures/pool-activity-eth-usdg.json";
import poolActivityKindRefused from "./fixtures/pool-activity-kind-refused.json";
import poolActivityNotListed from "./fixtures/pool-activity-not-listed.json";
import poolEthUsdg from "./fixtures/pool-eth-usdg.json";
import poolNotListed from "./fixtures/pool-not-listed.json";
import poolsMeme from "./fixtures/pools-meme.json";
import rangeRefused from "./fixtures/range-refused.json";
import tierNotConfigured from "./fixtures/tier-not-configured.json";

const BASE = "https://api.example";
const ETH_USDG = "0xbac3aa3b91584a53a579b3c999a56756e954e59247e497bad1d25a4334bde551";
const OLD_ETH_USDG = "0x54f7883914619af9105355bf83ed678bcf9f63560218ac61c9963b9503d0ba32";
const WALLET = "0x16a59f35ef7e61058e729c02c38c3b0406390b12";

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

/**
 * A backend that pages a history the way the live one does (`backend`
 * `fab3c76`, `src/activity/activity.service.ts`): newest first by block and
 * log, the rows after the cursor `blockNumber:logIndex`, one row more than
 * asked for read to know whether there is a next page, and the cursor of the
 * last row sent on every page. The rows are the recorded one, moved along
 * the chain.
 */
function paging(count: number) {
  const [recorded] = activityPageOne.items;
  // Three logs to a block, so a page ends in the middle of one.
  const log = (index: number) => ({
    ...recorded,
    blockNumber: String(76_000_000 + Math.floor(index / 3)),
    logIndex: index % 3,
    transactionHash: `0x${index.toString(16).padStart(64, "0")}`,
  });
  const history = Array.from({ length: count }, (_, index) => log(index)).reverse();
  const requests: string[] = [];

  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requests.push(`${url.pathname}${url.search}`);
    const limit = Number(url.searchParams.get("limit"));
    const [block, index] = (url.searchParams.get("cursor") ?? "").split(":");
    const after = url.searchParams.has("cursor")
      ? history.filter(
          (row) =>
            BigInt(row.blockNumber) < BigInt(block) ||
            (row.blockNumber === block && row.logIndex < Number(index)),
        )
      : history;
    const items = after.slice(0, limit);
    const last = items.at(-1);
    const body = {
      items,
      nextCursor: last ? `${last.blockNumber}:${last.logIndex}` : null,
      hasMore: after.length > limit,
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof globalThis.fetch;

  return {
    fetch,
    requests,
    /** A transaction the wallet sends while its history is being read. */
    arrive: () => history.unshift(log(history.length)),
    ids: () => history.map((row) => `${row.blockNumber}:${row.logIndex}`),
  };
}

/** Every page, from the first to the one with no next, as the Activity tab asks for them. */
async function readToTheEnd(fetch: typeof globalThis.fetch, between: () => void = () => {}) {
  const rows: ActivityRow[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page = await fetchActivity(WALLET, cursor, { baseUrl: BASE, fetch });
    rows.push(...page.rows);
    cursor = page.next;
    pages += 1;
    between();
  } while (cursor !== null && pages < 50);
  return { rows, pages };
}

describe("a wallet's history", () => {
  describe("positive", () => {
    it("asks for the first page of a wallet's history and reads the recorded answer", async () => {
      const { fetch, requests } = answering(activityPageOne);

      const page = await fetchActivity(WALLET, null, { baseUrl: BASE, fetch });

      expect(requests).toEqual([`${BASE}/activity/${WALLET}?limit=${ACTIVITY_PAGE_SIZE}`]);
      expect(page.rows.map((row) => [row.kind, row.amountUsdg])).toEqual([
        ["withdraw", 0.03],
        ["supply", 0.100613],
      ]);
    });

    it("asks for the page after a cursor with the cursor the page before gave", async () => {
      const first = await fetchActivity(WALLET, null, { baseUrl: BASE, fetch: answering(activityPageOne).fetch });
      const { fetch, requests } = answering(activityPageTwo);

      const second = await fetchActivity(WALLET, first.next, { baseUrl: BASE, fetch });

      expect(first.next).toBe("76256084:21");
      expect(requests).toEqual([`${BASE}/activity/${WALLET}?limit=${ACTIVITY_PAGE_SIZE}&cursor=76256084%3A21`]);
      expect(second.rows.map((row) => row.id)).toEqual(["76253701:9"]);
      expect(second.next).toBeNull();
    });

    it("reads a history of many pages to its end, every row once and in order", async () => {
      const backend = paging(3 * ACTIVITY_PAGE_SIZE + 7);

      const { rows, pages } = await readToTheEnd(backend.fetch);

      expect(pages).toBe(4);
      expect(backend.requests).toHaveLength(4);
      expect(rows.map((row) => row.id)).toEqual(backend.ids());
      expect(new Set(rows.map((row) => row.id)).size).toBe(3 * ACTIVITY_PAGE_SIZE + 7);
    });
  });

  describe("negative", () => {
    it("reports a refused address and a refused cursor as answers the app cannot use, as recorded", async () => {
      for (const refused of [activityAddressRefused, activityCursorRefused]) {
        const { fetch } = answering(refused, 400);

        expect(await failure(fetchActivity(WALLET, "nope", { baseUrl: BASE, fetch }))).toMatchObject({
          kind: "invalid",
          status: 400,
        });
      }
    });

    it("reports a backend whose indexer is behind, which is how it answers then", async () => {
      // Not recorded: the indexer was three seconds behind the chain when the answers were taken.
      const { fetch } = answering({ statusCode: 503, message: "Indexer is unavailable" }, 503);

      expect(await failure(fetchActivity(WALLET, null, { baseUrl: BASE, fetch }))).toMatchObject({
        kind: "unavailable",
        status: 503,
      });
    });

    it("reports an answer in another shape instead of listing it", async () => {
      for (const body of [markets, { items: [] }, { ...activityPageOne, hasMore: "yes" }, { ...activityPageOne, items: [{}] }]) {
        const { fetch } = answering(body);

        expect(await failure(fetchActivity(WALLET, null, { baseUrl: BASE, fetch }))).toMatchObject({ kind: "invalid" });
      }
    });
  });

  describe("edge case", () => {
    it("reads the recorded answer for a wallet with no transactions as a last, empty page", async () => {
      const { fetch } = answering(activityNone);

      expect(await fetchActivity(WALLET, null, { baseUrl: BASE, fetch })).toEqual({ rows: [], next: null });
    });

    it("stops at a history that ends exactly on a page, without asking for an empty one", async () => {
      const backend = paging(2 * ACTIVITY_PAGE_SIZE);

      const { rows, pages } = await readToTheEnd(backend.fetch);

      expect(pages).toBe(2);
      expect(rows).toHaveLength(2 * ACTIVITY_PAGE_SIZE);
    });

    it("loses no row and repeats none when the wallet sends a transaction between two pages", async () => {
      const backend = paging(2 * ACTIVITY_PAGE_SIZE + 5);
      const before = backend.ids();

      const { rows } = await readToTheEnd(backend.fetch, backend.arrive);

      // The rows that were there when the reading began, all of them, once. The new ones come with the next refresh.
      expect(rows.map((row) => row.id)).toEqual(before);
    });

    it("asks nothing when the build was given no backend", async () => {
      vi.stubEnv("NEXT_PUBLIC_API_URL", "");
      const { fetch, requests } = answering(activityPageOne);

      expect((await failure(fetchActivity(WALLET, null, { fetch }))).kind).toBe("not-configured");
      expect(requests).toEqual([]);
    });
  });
});

describe("historyFailureMessage", () => {
  const KINDS = ["not-configured", "unreachable", "unavailable", "not-found", "invalid"] as const;

  describe("positive", () => {
    it("says why there is no history", () => {
      expect(historyFailureMessage(new BackendError("unavailable", "", 503))).toMatch(/catching up with the chain/);
      expect(historyFailureMessage(new BackendError("unreachable", ""))).toMatch(/did not answer/);
      expect(historyFailureMessage(new BackendError("not-configured", ""))).toMatch(/no market data service configured/);
      expect(historyFailureMessage(new BackendError("invalid", "", 400))).toMatch(/a form this app does not read/);
    });
  });

  describe("negative", () => {
    it("never says that the wallet has no transactions", () => {
      for (const kind of KINDS) {
        expect(historyFailureMessage(new BackendError(kind, kind))).not.toMatch(/no transactions/i);
      }
    });
  });

  describe("edge case", () => {
    it("says that the transactions are on the chain, whatever failed", () => {
      for (const error of [...KINDS.map((kind) => new BackendError(kind, kind)), new TypeError("fetch failed"), undefined]) {
        expect(historyFailureMessage(error)).toMatch(/on the chain, and the block explorer lists them/);
      }
    });
  });
});

/**
 * A backend that pages a pool's history the way the live one does (`backend`
 * `fab3c76`, `src/activity/pool-activity.service.ts`): every row with every
 * field, newest first, one kind when `kind` is given, the rows after the
 * cursor, and the cursor of the last row sent on every page.
 */
function pagingPool(count: number) {
  const kinds = ["deposit", "borrow", "repay", "withdraw", "liquidation"];
  const history = Array.from({ length: count }, (_, index) => ({
    market: "0x1f69d27f1ac7415a4252957951900130cb885484",
    poolId: ETH_USDG,
    timestamp: String(1_790_750_000 + index),
    blockNumber: String(76_300_000 + Math.floor(index / 3)),
    logIndex: index % 3,
    transactionHash: `0x${index.toString(16).padStart(64, "0")}`,
    tokenId: "3402463",
    owner: "0x5619cf6fc59ab4f374b7c843ba993e1cbe629fa6",
    kind: kinds[index % kinds.length],
    amountUsdg: ["borrow", "repay"].includes(kinds[index % kinds.length]) ? "1000000" : null,
    liquidator: kinds[index % kinds.length] === "liquidation" ? "0x020eede0121e317e338d24b20754f55cced00cae" : null,
    repaidUsdg: kinds[index % kinds.length] === "liquidation" ? "1000000" : null,
    badDebtUsdg: kinds[index % kinds.length] === "liquidation" ? "0" : null,
    full: kinds[index % kinds.length] === "liquidation" ? false : null,
  })).reverse();
  const requests: string[] = [];

  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requests.push(`${url.pathname}${url.search}`);
    const limit = Number(url.searchParams.get("limit"));
    const kind = url.searchParams.get("kind");
    const [block, index] = (url.searchParams.get("cursor") ?? "").split(":");
    const ofKind = kind ? history.filter((row) => row.kind === kind) : history;
    const after = url.searchParams.has("cursor")
      ? ofKind.filter((row) => BigInt(row.blockNumber) < BigInt(block) || (row.blockNumber === block && row.logIndex < Number(index)))
      : ofKind;
    const items = after.slice(0, limit);
    const last = items.at(-1);
    const body = { items, nextCursor: last ? `${last.blockNumber}:${last.logIndex}` : null, hasMore: after.length > limit };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof globalThis.fetch;

  return { fetch, requests, ids: (kind?: string) => history.filter((row) => !kind || row.kind === kind).map((row) => `${row.blockNumber}:${row.logIndex}`) };
}

describe("a pool's history", () => {
  describe("positive", () => {
    it("asks for the first page of a pool's history and reads the recorded answer", async () => {
      const { fetch, requests } = answering(poolActivityEmpty);

      const page = await fetchPoolActivity(ETH_USDG, "all", null, { baseUrl: BASE, fetch });

      expect(requests).toEqual([`${BASE}/pools/${ETH_USDG}/activity?limit=${ACTIVITY_PAGE_SIZE}`]);
      expect(page).toEqual({ rows: [], next: null });
    });

    it("asks the backend for one kind, under the name the route takes, and reads the recorded answer", async () => {
      const { fetch, requests } = answering(poolActivityBorrow);

      const page = await fetchPoolActivity(ETH_USDG, "borrow", null, { baseUrl: BASE, fetch });

      expect(requests).toEqual([`${BASE}/pools/${ETH_USDG}/activity?limit=${ACTIVITY_PAGE_SIZE}&kind=borrow`]);
      expect(page.rows).toEqual([]);
    });

    it("reads a pool's history of many pages to its end, every row once and in order", async () => {
      const backend = pagingPool(3 * ACTIVITY_PAGE_SIZE + 4);
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await fetchPoolActivity(ETH_USDG, "all", cursor, { baseUrl: BASE, fetch: backend.fetch });
        ids.push(...page.rows.map((row) => row.id));
        cursor = page.next;
      } while (cursor !== null && ids.length < 1_000);

      expect(backend.requests).toHaveLength(4);
      expect(ids).toEqual(backend.ids());
      expect(backend.requests[1]).toMatch(/&cursor=\d+%3A\d+$/);
    });
  });

  describe("negative", () => {
    it("reports a pool the backend does not list, as recorded for the old ETH/USDG pool", async () => {
      const { fetch } = answering(poolActivityNotListed, 404);

      expect(await failure(fetchPoolActivity(OLD_ETH_USDG, "all", null, { baseUrl: BASE, fetch }))).toMatchObject({
        kind: "not-found",
        status: 404,
      });
    });

    it("reports a refused kind as an answer the app cannot use, as recorded", async () => {
      const { fetch } = answering(poolActivityKindRefused, 400);

      expect(await failure(fetchPoolActivity(ETH_USDG, "all", null, { baseUrl: BASE, fetch }))).toMatchObject({
        kind: "invalid",
        status: 400,
      });
    });

    it("reports a backend whose indexer is behind, as the live one answered on 30 Sep 2026", async () => {
      // Not kept as a file: the answer was read from the live backend while its indexer was 88 seconds behind.
      const { fetch } = answering({ message: "Indexer is behind", error: "Service Unavailable", statusCode: 503 }, 503);

      expect(await failure(fetchPoolActivity(ETH_USDG, "all", null, { baseUrl: BASE, fetch }))).toMatchObject({
        kind: "unavailable",
        status: 503,
      });
    });

    it("reports a wallet's history given for a pool's as another shape", async () => {
      const { fetch } = answering(activityPageOne);

      expect(await failure(fetchPoolActivity(ETH_USDG, "all", null, { baseUrl: BASE, fetch }))).toMatchObject({ kind: "invalid" });
    });
  });

  describe("edge case", () => {
    it("asks for all kinds without naming one", async () => {
      const { fetch, requests } = answering(poolActivityEmpty);

      await fetchPoolActivity(ETH_USDG, "all", "76300000:2", { baseUrl: BASE, fetch });

      expect(requests[0]).not.toMatch(/kind=/);
      expect(requests[0]).toMatch(/&cursor=76300000%3A2$/);
    });

    it("pages one kind to its end with the kind on every request", async () => {
      const backend = pagingPool(12 * ACTIVITY_PAGE_SIZE);
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await fetchPoolActivity(ETH_USDG, "repay", cursor, { baseUrl: BASE, fetch: backend.fetch });
        ids.push(...page.rows.map((row) => row.id));
        expect(page.rows.every((row) => row.kind === "repay")).toBe(true);
        cursor = page.next;
      } while (cursor !== null && ids.length < 1_000);

      expect(ids).toEqual(backend.ids("repay"));
      expect(backend.requests.length).toBeGreaterThan(1);
      expect(backend.requests.every((request) => request.includes("&kind=repay"))).toBe(true);
    });
  });
});

describe("historyFailureMessage for a pool", () => {
  const KINDS = ["not-configured", "unreachable", "unavailable", "not-found", "invalid"] as const;

  describe("positive", () => {
    it("says why the pool's transactions are not shown, one sentence per reason", () => {
      const messages = KINDS.map((kind) => historyFailureMessage(new BackendError(kind, kind), "pool"));

      expect(new Set(messages).size).toBe(5);
      expect(historyFailureMessage(new BackendError("unavailable", "", 503), "pool")).toMatch(/catching up with the chain/);
      expect(historyFailureMessage(new BackendError("not-found", "", 404), "pool")).toMatch(/does not list this pool/);
    });
  });

  describe("negative", () => {
    it("does not speak of the reader's own transactions: a pool's are everybody's", () => {
      for (const kind of KINDS) {
        expect(historyFailureMessage(new BackendError(kind, kind), "pool")).not.toMatch(/\byour\b/i);
      }
    });
  });

  describe("edge case", () => {
    it("leaves the wallet's sentences as they were", () => {
      expect(historyFailureMessage(new BackendError("unreachable", ""))).toBe(
        "The market data service did not answer, so your history is not shown. Your transactions are on the chain, and the block explorer lists them.",
      );
      expect(historyFailureMessage(new BackendError("not-configured", ""))).toMatch(/so there is no history to show/);
    });
  });
});
