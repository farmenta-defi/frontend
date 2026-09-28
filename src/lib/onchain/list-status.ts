/**
 * What a list of positions shows, decided in one place for the pool page and
 * for Portfolio.
 *
 * "Looking for your positions" is for the first read only. While the list is
 * read again, or a position that has just arrived is being read, what is on
 * screen stays on screen.
 */
export type ListStatus =
  /** Nothing to read yet: no wallet, or no deployment. */
  | "idle"
  /** The first read. */
  | "loading"
  /** The logs could not be read, which is not the wallet having no positions. */
  | "failed"
  | "ready";

export type ListState = {
  status: ListStatus;
  /** Positions that were found and could not be read. They are read again on the next refresh. */
  unread: number;
};

export function listState(list: {
  /** The search in the chain's logs. */
  discovery: { isLoading: boolean; isError: boolean; hasData: boolean };
  /** Positions the search found for this list. */
  found: number;
  /** Of those, the ones read and on screen. */
  shown: number;
  /** Of those, the ones being read for the first time. */
  reading: number;
  /** Of those, the ones whose read failed. */
  failed: number;
}): ListState {
  const { discovery, found, shown, reading, failed } = list;
  if (discovery.isError) return { status: "failed", unread: 0 };
  if (discovery.isLoading) return { status: "loading", unread: 0 };
  if (!discovery.hasData) return { status: "idle", unread: 0 };
  // Found, none on screen yet, and at least one still on its way.
  if (found > 0 && shown === 0 && reading > 0) return { status: "loading", unread: 0 };
  return { status: "ready", unread: failed };
}

/** What a list says about the positions it could not read, or nothing when it read them all. */
export const unreadNote = (unread: number) =>
  unread === 0
    ? null
    : `Couldn't load ${unread === 1 ? "one of your positions" : `${unread} of your positions`}. It is tried again every 15 seconds.`;
