import { describe, expect, it } from "vitest";

import {
  foldFees,
  ACTIVITY_FILTERS,
  activityLabel,
  activityPageOf,
  historyRows,
  matchesFilter,
  POOL_ACTIVITY_FILTERS,
  poolActivityPageOf,
  type ActivityKind,
  type ActivityRow,
} from "./activity";
import none from "./fixtures/activity-none.json";
import pageOne from "./fixtures/activity-page-1.json";
import pageTwo from "./fixtures/activity-page-2.json";
import poolEmpty from "./fixtures/pool-activity-eth-usdg.json";
import {
  readActivity,
  readPoolActivity,
  type WireActivity,
  type WireActivityRow,
  type WirePoolActivity,
  type WirePoolActivityRow,
} from "./wire";

const BLUE_CHIP = "0x1f69d27f1ac7415a4252957951900130cb885484";

const recorded = (body: unknown): WireActivity => {
  const activity = readActivity(body);
  expect(activity, "the recorded answer has the backend's shape").not.toBeNull();
  return activity!;
};

/**
 * Not recorded: nobody has deposited collateral, borrowed or been liquidated
 * on the chain yet, so the live backend has no such row to send. The fields
 * are the ones its query selects (`backend` `fab3c76`,
 * `src/activity/activity.service.ts`), on the recorded row's common fields.
 */
const common = (logIndex: number): WireActivityRow => ({
  category: "loan",
  market: BLUE_CHIP,
  blockNumber: "76300000",
  logIndex,
  timestamp: "1790750000",
  transactionHash: `0x${String(logIndex).padStart(64, "0")}`,
});
const loanRow = (kind: string, amountUsdg: string | null, logIndex = 1): WireActivityRow => ({
  ...common(logIndex),
  tokenId: "3402463",
  owner: "0x16a59f35ef7e61058e729c02c38c3b0406390b12",
  kind,
  amountUsdg,
});
const liquidationRow = (full: boolean): WireActivityRow => ({
  ...common(7),
  category: "liquidation",
  tokenId: "3402463",
  full,
  repaidUsdg: "12500000",
  badDebtUsdg: "0",
});

const page = (items: WireActivityRow[], more: Partial<WireActivity> = {}): WireActivity => ({
  items,
  nextCursor: null,
  hasMore: false,
  ...more,
});
const rowsOf = (items: WireActivityRow[]) => activityPageOf(page(items))!.rows;

describe("activityPageOf", () => {
  describe("positive", () => {
    it("reads the recorded first page: a withdrawal and a supply, newest first, in USDG", () => {
      const first = activityPageOf(recorded(pageOne));

      expect(first).toEqual({
        rows: [
          {
            id: "76256790:2",
            at: 1_790_745_230_000,
            kind: "withdraw",
            market: BLUE_CHIP,
            amountUsdg: 0.03,
            tokenId: null,
            fullSeizure: null,
            transactionHash: "0xb7f76dc6b428d43aa6af192daf1d99940af13f33991d38d6551cdfdadcf1fad7",
          },
          {
            id: "76256084:21",
            at: 1_790_745_159_000,
            kind: "supply",
            market: BLUE_CHIP,
            amountUsdg: 0.100613,
            tokenId: null,
            fullSeizure: null,
            transactionHash: "0x4552664816ea9d118349dc69c23c8fa0fbd2496b900ea654905a4c45290b7eb0",
          },
        ],
        next: "76256084:21",
      });
    });

    it("names each of the borrower's kinds, with the position it is about", () => {
      const kinds = ["deposit", "withdraw", "borrow", "repay", "increase_liquidity", "decrease_liquidity", "collect_fees"];

      const rows = rowsOf(kinds.map((kind, index) => loanRow(kind, null, index)));

      expect(rows.map((row) => row.kind)).toEqual([
        "collateral-deposit",
        "collateral-withdraw",
        "borrow",
        "repay",
        "liquidity-increase",
        "liquidity-decrease",
        "fees-collect",
      ]);
      expect(rows.every((row) => row.tokenId === "3402463")).toBe(true);
    });

    it("reads what was borrowed and repaid, and what a liquidator repaid", () => {
      const [borrow, repay, liquidation] = rowsOf([
        loanRow("borrow", "25000000", 1),
        loanRow("repay", "10500000", 2),
        liquidationRow(true),
      ]);

      expect(borrow.amountUsdg).toBe(25);
      expect(repay.amountUsdg).toBe(10.5);
      expect(liquidation).toMatchObject({ kind: "liquidation", amountUsdg: 12.5, fullSeizure: true, tokenId: "3402463" });
    });
  });

  describe("negative", () => {
    it("refuses a page with a row that cannot be placed on the chain or in time", () => {
      const [row] = recorded(pageOne).items;
      const broken: Partial<WireActivityRow>[] = [
        { blockNumber: "0x48b9a16" },
        { blockNumber: "-1" },
        { logIndex: 1.5 },
        { logIndex: -1 },
        { timestamp: "2026-09-30T05:13:50Z" },
        { transactionHash: "0xb7f76dc6" },
        { market: "blueChip" },
      ];

      for (const fields of broken) {
        expect(activityPageOf(page([{ ...row, ...fields } as WireActivityRow])), JSON.stringify(fields)).toBeNull();
      }
    });

    it("refuses a page that says there is more and gives nothing to ask for it with", () => {
      const { items } = recorded(pageOne);

      expect(activityPageOf(page(items, { hasMore: true, nextCursor: null }))).toBeNull();
      expect(activityPageOf(page(items, { hasMore: true, nextCursor: "" }))).toBeNull();
    });

    it("shows a dash, never a zero, for an amount that did not come as one", () => {
      const [withdraw] = recorded(pageOne).items;

      for (const assetsUsdg of [null, undefined, 30000, "0.03", "-30000", ""]) {
        expect(rowsOf([{ ...withdraw, assetsUsdg }])[0].amountUsdg, String(assetsUsdg)).toBeNull();
      }
    });
  });

  describe("edge case", () => {
    it("reads the recorded last page: the backend still sends a cursor, and there is no next page", () => {
      const wire = recorded(pageTwo);
      expect(wire.nextCursor).toBe("76253701:9");

      const last = activityPageOf(wire);

      expect(last?.rows.map((row) => [row.kind, row.amountUsdg])).toEqual([["supply", 0.031396]]);
      expect(last?.next).toBeNull();
    });

    it("reads the recorded answer for a wallet with no transactions as an empty last page", () => {
      expect(activityPageOf(recorded(none))).toEqual({ rows: [], next: null });
    });

    it("calls the same word by its category: a deposit is a supply to the vault and collateral to a loan", () => {
      const [deposit] = recorded(pageTwo).items;

      expect(rowsOf([deposit])[0].kind).toBe("supply");
      expect(rowsOf([loanRow("deposit", null)])[0].kind).toBe("collateral-deposit");
    });

    it("keeps a row of a kind it has no name for, with its date and its transaction", () => {
      const [withdraw] = recorded(pageOne).items;
      const unknown = [
        { ...withdraw, kind: "flash_loan" },
        { ...withdraw, category: "governance" },
        { ...withdraw, kind: undefined },
        { ...withdraw, kind: "toString" },
        // A loan has no "transfer", and the vault no "borrow".
        { ...withdraw, kind: "borrow" },
        loanRow("transfer", null),
      ];

      const rows = rowsOf(unknown);

      expect(rows).toHaveLength(unknown.length);
      expect(rows.map((row) => row.kind)).toEqual(unknown.map(() => "other"));
      expect(rows.every((row) => row.amountUsdg === null)).toBe(true);
      expect(rows[0]).toMatchObject({ at: 1_790_745_230_000, transactionHash: withdraw.transactionHash });
    });

    it("has no USDG amount for a transfer of shares, which moves none", () => {
      const [withdraw] = recorded(pageOne).items;

      const [transfer] = rowsOf([{ ...withdraw, kind: "transfer", assetsUsdg: null }]);

      expect(transfer).toMatchObject({ kind: "share-transfer", amountUsdg: null });
    });

    it("does not read an amount into a kind that moves no USDG, whatever the row carries", () => {
      expect(rowsOf([loanRow("collect_fees", "999")])[0].amountUsdg).toBeNull();
    });
  });
});

describe("historyRows", () => {
  const first = activityPageOf(readActivity(pageOne)!)!;
  const second = activityPageOf(readActivity(pageTwo)!)!;

  describe("positive", () => {
    it("lists the recorded pages as one history, newest first", () => {
      expect(historyRows([first, second]).map((row) => row.id)).toEqual(["76256790:2", "76256084:21", "76253701:9"]);
    });
  });

  describe("negative", () => {
    it("lists a log once when two pages both carry it", () => {
      const overlapping = { rows: [first.rows[1], ...second.rows], next: null };

      expect(historyRows([first, overlapping]).map((row) => row.id)).toEqual(["76256790:2", "76256084:21", "76253701:9"]);
    });
  });

  describe("edge case", () => {
    it("is empty before any page, and for a wallet with no transactions", () => {
      expect(historyRows([])).toEqual([]);
      expect(historyRows([{ rows: [], next: null }])).toEqual([]);
    });

    it("keeps two logs of one transaction apart", () => {
      const [withdraw] = readActivity(pageOne)!.items;
      const twoLogs = activityPageOf(page([withdraw, { ...withdraw, logIndex: 1 }]))!;

      expect(historyRows([twoLogs]).map((row) => row.id)).toEqual(["76256790:2", "76256790:1"]);
    });
  });
});

describe("what a row is called and what a filter keeps", () => {
  const KINDS: ActivityKind[] = [
    "supply",
    "withdraw",
    "share-transfer",
    "collateral-deposit",
    "collateral-withdraw",
    "borrow",
    "repay",
    "liquidity-increase",
    "liquidity-decrease",
    "fees-collect",
    "liquidation",
    "other",
  ];
  const row = (kind: ActivityKind, fullSeizure: boolean | null = null): Pick<ActivityRow, "kind" | "fullSeizure"> => ({
    kind,
    fullSeizure,
  });

  describe("positive", () => {
    it("gives every kind a name of its own", () => {
      const labels = KINDS.map((kind) => activityLabel(row(kind)));

      expect(new Set(labels).size).toBe(KINDS.length);
      expect(activityLabel(row("supply"))).toBe("Supply");
      expect(activityLabel(row("collateral-deposit"))).toBe("Deposit collateral");
    });

    it("keeps each kind under one filter, and everything under All", () => {
      const narrow = ACTIVITY_FILTERS.map((filter) => filter.id).filter((id) => id !== "all");

      for (const kind of KINDS) {
        expect(matchesFilter(row(kind), "all")).toBe(true);
        const kept = narrow.filter((filter) => matchesFilter(row(kind), filter));
        expect(kept, kind).toHaveLength(kind === "other" ? 0 : 1);
      }
    });
  });

  describe("negative", () => {
    it("does not list a supply among the loans, or a loan among the supplies", () => {
      expect(matchesFilter(row("supply"), "loans")).toBe(false);
      expect(matchesFilter(row("withdraw"), "collateral")).toBe(false);
      expect(matchesFilter(row("borrow"), "lending")).toBe(false);
      expect(matchesFilter(row("collateral-withdraw"), "lending")).toBe(false);
    });
  });

  describe("edge case", () => {
    it("says whether a liquidation took the whole position, when the backend says", () => {
      expect(activityLabel(row("liquidation", true))).toBe("Full liquidation");
      expect(activityLabel(row("liquidation", false))).toBe("Partial liquidation");
      expect(activityLabel(row("liquidation", null))).toBe("Liquidation");
    });
  });
});

/**
 * Not recorded: no position has been deposited, borrowed against or liquidated
 * on the chain, so the live backend answers every pool with an empty list.
 * The rows are built with the fields and the nulls the backend's service
 * writes (`backend` `fab3c76`, `src/activity/pool-activity.service.ts`, type
 * `ActivityRow`).
 */
const ETH_USDG = "0xbac3aa3b91584a53a579b3c999a56756e954e59247e497bad1d25a4334bde551";
const BORROWER = "0x5619cf6fc59ab4f374b7c843ba993e1cbe629fa6";
const poolRow = (kind: string, fields: Partial<WirePoolActivityRow> = {}, logIndex = 1): WirePoolActivityRow => ({
  market: BLUE_CHIP,
  poolId: ETH_USDG,
  timestamp: "1790750000",
  blockNumber: "76300000",
  logIndex,
  transactionHash: `0x${String(logIndex).padStart(64, "0")}`,
  tokenId: "3402463",
  owner: BORROWER,
  kind,
  amountUsdg: null,
  liquidator: null,
  repaidUsdg: null,
  badDebtUsdg: null,
  full: null,
  ...fields,
});
const liquidated = (full: boolean) =>
  poolRow("liquidation", { liquidator: "0x020eede0121e317e338d24b20754f55cced00cae", repaidUsdg: "12500000", badDebtUsdg: "0", full }, 9);
const poolPage = (items: WirePoolActivityRow[], more: Partial<WirePoolActivity> = {}): WirePoolActivity => ({
  items,
  nextCursor: null,
  hasMore: false,
  ...more,
});
const poolRowsOf = (items: WirePoolActivityRow[]) => poolActivityPageOf(poolPage(items))!.rows;

describe("poolActivityPageOf", () => {
  describe("positive", () => {
    it("names the five kinds a pool's history has, with the position and whose it is", () => {
      const rows = poolRowsOf([
        poolRow("deposit", {}, 1),
        poolRow("withdraw", {}, 2),
        poolRow("borrow", { amountUsdg: "300000000" }, 3),
        poolRow("repay", { amountUsdg: "120500000" }, 4),
        liquidated(false),
      ]);

      expect(rows.map((row) => row.kind)).toEqual(["collateral-deposit", "collateral-withdraw", "borrow", "repay", "liquidation"]);
      expect(rows.map((row) => activityLabel(row))).toEqual([
        "Deposit collateral",
        "Withdraw collateral",
        "Borrow",
        "Repay",
        "Partial liquidation",
      ]);
      expect(rows.every((row) => row.tokenId === "3402463" && row.owner === BORROWER)).toBe(true);
    });

    it("reads what was borrowed and repaid, and what a liquidator repaid", () => {
      const [borrow, repay, liquidation] = poolRowsOf([
        poolRow("borrow", { amountUsdg: "300000000" }, 3),
        poolRow("repay", { amountUsdg: "120500000" }, 4),
        liquidated(true),
      ]);

      expect(borrow.amountUsdg).toBe(300);
      expect(repay.amountUsdg).toBe(120.5);
      expect(liquidation).toMatchObject({ amountUsdg: 12.5, fullSeizure: true });
      expect(activityLabel(liquidation)).toBe("Full liquidation");
    });

    it("places a row in time and on the chain", () => {
      const [row] = poolRowsOf([poolRow("borrow", { amountUsdg: "1" }, 7)]);

      expect(row).toMatchObject({ id: "76300000:7", at: 1_790_750_000_000, market: BLUE_CHIP });
      expect(row.transactionHash).toMatch(/^0x0{63}7$/);
    });
  });

  describe("negative", () => {
    it("refuses a page with a row that cannot be placed, or has no position or no owner", () => {
      const broken: Partial<WirePoolActivityRow>[] = [
        { blockNumber: "0x48c4e60" },
        { logIndex: -1 },
        { logIndex: 0.5 },
        { timestamp: "2026-09-30T06:33:20Z" },
        { transactionHash: "0x1234" },
        { market: "blueChip" },
        { tokenId: "#3402463" },
        { owner: "0x5619" },
      ];

      for (const fields of broken) {
        expect(poolActivityPageOf(poolPage([poolRow("borrow", fields)])), JSON.stringify(fields)).toBeNull();
      }
    });

    it("does not read a body whose rows lack a field every row has", () => {
      for (const field of ["poolId", "kind", "tokenId", "owner", "transactionHash", "blockNumber"]) {
        const row: Record<string, unknown> = { ...poolRow("borrow") };
        delete row[field];

        expect(readPoolActivity({ items: [row], nextCursor: null, hasMore: false }), field).toBeNull();
      }
    });

    it("refuses a page that says there is more and gives nothing to ask for it with", () => {
      expect(poolActivityPageOf(poolPage([poolRow("borrow")], { hasMore: true, nextCursor: null }))).toBeNull();
    });

    it("shows a dash, never a zero, for a loan whose amount did not come as one", () => {
      for (const amountUsdg of [null, undefined, 300, "300.5", ""]) {
        expect(poolRowsOf([poolRow("borrow", { amountUsdg })])[0].amountUsdg, String(amountUsdg)).toBeNull();
      }
    });
  });

  describe("edge case", () => {
    it("reads the recorded answer of the live backend, a pool nobody has borrowed against, as an empty last page", () => {
      const recordedEmpty = readPoolActivity(poolEmpty);

      expect(recordedEmpty).not.toBeNull();
      expect(poolActivityPageOf(recordedEmpty!)).toEqual({ rows: [], next: null });
    });

    it("has no amount for collateral going in or out, which moves no USDG, whatever the row carries", () => {
      const [deposit, withdraw] = poolRowsOf([poolRow("deposit", { amountUsdg: "999" }, 1), poolRow("withdraw", { repaidUsdg: "999" }, 2)]);

      expect(deposit.amountUsdg).toBeNull();
      expect(withdraw.amountUsdg).toBeNull();
    });

    it("does not take a liquidation's repayment from the field of a loan, or a loan's from a liquidation's", () => {
      const [liquidation] = poolRowsOf([poolRow("liquidation", { amountUsdg: "999", repaidUsdg: "12500000", full: false }, 9)]);
      const [borrow] = poolRowsOf([poolRow("borrow", { amountUsdg: "300000000", repaidUsdg: "999" }, 3)]);

      expect(liquidation.amountUsdg).toBe(12.5);
      expect(borrow.amountUsdg).toBe(300);
    });

    it("keeps a row of a kind it has no name for, with its date, its owner and its transaction", () => {
      const rows = poolRowsOf([poolRow("flash_loan", {}, 1), poolRow("toString", {}, 2)]);

      expect(rows.map((row) => row.kind)).toEqual(["other", "other"]);
      expect(rows[0]).toMatchObject({ owner: BORROWER, at: 1_790_750_000_000, amountUsdg: null });
    });

    it("sends the cursor of the last page nowhere, as the wallet's list does", () => {
      const last = poolActivityPageOf(poolPage([poolRow("borrow", { amountUsdg: "1" })], { nextCursor: "76300000:1", hasMore: false }));

      expect(last?.next).toBeNull();
    });

    it("lists the pages of a pool as one history, a log once", () => {
      const first = poolActivityPageOf(poolPage([poolRow("repay", { amountUsdg: "1" }, 4), poolRow("borrow", { amountUsdg: "1" }, 3)], { nextCursor: "76300000:3", hasMore: true }))!;
      const second = poolActivityPageOf(poolPage([poolRow("borrow", { amountUsdg: "1" }, 3), poolRow("deposit", {}, 1)]))!;

      expect(historyRows([first, second]).map((row) => row.id)).toEqual(["76300000:4", "76300000:3", "76300000:1"]);
    });
  });
});

describe("what a pool's list can be narrowed to", () => {
  describe("positive", () => {
    it("offers every kind the route sends, under the name the route takes", () => {
      expect(POOL_ACTIVITY_FILTERS.map((filter) => filter.id)).toEqual(["all", "deposit", "withdraw", "borrow", "repay", "liquidation"]);
    });
  });

  describe("negative", () => {
    it("offers no supply and no withdrawal of USDG: those are the market's, not a pool's", () => {
      const labels = POOL_ACTIVITY_FILTERS.map((filter) => filter.label);

      expect(labels).not.toContain("Supply");
      expect(labels).not.toContain("Withdraw");
    });
  });

  describe("edge case", () => {
    it("calls each kind what the row of that kind is called", () => {
      for (const filter of POOL_ACTIVITY_FILTERS) {
        if (filter.id === "all" || filter.id === "liquidation") continue;
        expect(activityLabel(poolRowsOf([poolRow(filter.id)])[0]), filter.id).toBe(filter.label);
      }
    });
  });
});

describe("foldFees: a change of liquidity is one row", () => {
  /** Two logs of one transaction, newest first as the backend sends them: the liquidity's comes after the fees'. */
  const together = (kind: string, fromLog: number) => {
    const { transactionHash } = common(fromLog);
    return [
      { ...loanRow(kind, null, fromLog + 1), transactionHash },
      { ...loanRow("collect_fees", null, fromLog), transactionHash },
    ];
  };
  const removal = (fromLog: number) => together("decrease_liquidity", fromLog);
  const kinds = (rows: { kind: string; withFees?: boolean }[]) => rows.map((row) => (row.withFees ? `${row.kind}+fees` : row.kind));

  describe("positive", () => {
    it("shows a removal and the fees paid out with it as one row that says so", () => {
      const rows = foldFees(rowsOf(removal(4)));

      expect(kinds(rows)).toEqual(["liquidity-decrease+fees"]);
      expect(activityLabel(rows[0])).toBe("Remove liquidity");
    });

    it("does the same for liquidity added", () => {
      const rows = foldFees(rowsOf(together("increase_liquidity", 4)));

      expect(kinds(rows)).toEqual(["liquidity-increase+fees"]);
    });
  });

  describe("negative", () => {
    it("keeps the row of fees collected on their own", () => {
      expect(kinds(foldFees(rowsOf([loanRow("collect_fees", null, 4)])))).toEqual(["fees-collect"]);
    });

    it("does not fold the fees of another transaction, or of another position", () => {
      const liquidity = loanRow("decrease_liquidity", null, 5);
      // The fees of another transaction, and the fees of another position in the same one.
      const elsewhere = { ...loanRow("collect_fees", null, 2), transactionHash: `0x${"ab".repeat(32)}` };
      const other = { ...loanRow("collect_fees", null, 3), transactionHash: liquidity.transactionHash, tokenId: "999" };

      const rows = foldFees(rowsOf([liquidity, other, elsewhere]));

      expect(kinds(rows)).toEqual(["liquidity-decrease", "fees-collect", "fees-collect"]);
    });
  });

  describe("edge case", () => {
    it("leaves the removal without the mention until the page with its fees is read, and folds it then", () => {
      const [liquidity, fees] = removal(4);
      const first = activityPageOf(page([liquidity], { hasMore: true, nextCursor: "1:5" }))!;
      const second = activityPageOf(page([fees]))!;

      expect(kinds(foldFees(historyRows([first])))).toEqual(["liquidity-decrease"]);
      expect(kinds(foldFees(historyRows([first, second])))).toEqual(["liquidity-decrease+fees"]);
    });

    it("touches no other row, and keeps their order", () => {
      const rows = rowsOf([loanRow("repay", "1000000", 9), ...removal(4), loanRow("borrow", "2000000", 2)]);

      expect(kinds(foldFees(rows))).toEqual(["repay", "liquidity-decrease+fees", "borrow"]);
    });

    it("still counts under the filter for liquidity and fees", () => {
      expect(foldFees(rowsOf(removal(4))).every((row) => matchesFilter(row, "liquidity"))).toBe(true);
    });
  });
});
