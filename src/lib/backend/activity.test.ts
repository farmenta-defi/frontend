import { describe, expect, it } from "vitest";

import {
  ACTIVITY_FILTERS,
  activityLabel,
  activityPageOf,
  historyRows,
  matchesFilter,
  type ActivityKind,
  type ActivityRow,
} from "./activity";
import none from "./fixtures/activity-none.json";
import pageOne from "./fixtures/activity-page-1.json";
import pageTwo from "./fixtures/activity-page-2.json";
import { readActivity, type WireActivity, type WireActivityRow } from "./wire";

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
