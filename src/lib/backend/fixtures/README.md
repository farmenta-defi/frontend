# Recorded answers

**Every answer here was recorded against the first mainnet deployment (28 Sep 2026), which the
deployment of 1 Oct 2026 replaced.** The market addresses in them (`0x1f69…5484` Blue-chip,
`0x992c…E751` Meme) are that deployment's and are not in `deployments/mainnet.json` any more,
and the pools carry the $50 minimum position of that deployment, where the listings now carry
$5. They are kept because the shape of the answers has not changed, and because the new
markets have no history yet to record: a pool's half-hourly history, a wallet's supplies and
withdrawal. Record them again once the new markets have that.

These files are answers of the live backend (`backend` `main` `ff25486`), recorded on
29 Sep 2026 at 06:03 UTC and only re-indented. The data layer's tests read them, so a test
fails when the app stops understanding what the backend really sends.

| File | Request | Status |
|---|---|---|
| `markets.json` | `GET /markets` | 200 |
| `pools-blue-chip.json` | `GET /markets/blue-chip/pools` | 200 |
| `pools-meme.json` | `GET /markets/meme/pools` | 200 |
| `pool-eth-usdg.json` | `GET /pools/0xbac3…e551` | 200 |
| `pool-meta-usdg.json` | `GET /pools/0x5875…ae36` | 200 |
| `pool-pons-usdg.json` | `GET /pools/0x4864…a6ea` | 200 |
| `pool-not-listed.json` | `GET /pools/0x54f7…ba32`, a pool that is not listed | 404 |
| `tier-not-configured.json` | `GET /markets/nope/pools` | 404 |
| `range-refused.json` | `GET /markets?range=2d` | 400 |

Nothing had been supplied or borrowed when they were recorded, so every amount and every rate
in them is zero. That is the state the app has to show as zero, not as a failure.

The answers of `GET /activity/:address` were recorded from the live backend on 30 Sep 2026 at
05:27 UTC, and only re-indented:

| File | Request | Status |
|---|---|---|
| `activity-page-1.json` | `GET /activity/0x16a5…0b12?limit=2` | 200 |
| `activity-page-2.json` | `GET /activity/0x16a5…0b12?limit=2&cursor=76256084:21` | 200 |
| `activity-none.json` | `GET /activity/0x0000…dEaD?limit=25`, a wallet with no transactions | 200 |
| `activity-address-refused.json` | `GET /activity/nope` | 400 |
| `activity-cursor-refused.json` | `GET /activity/0x16a5…0b12?cursor=nope` | 400 |

The wallet had supplied twice and withdrawn once, which was every transaction in either market
at the time. Nobody had deposited collateral, borrowed or been liquidated, so there is no
recorded row of those kinds: the tests build them from the fields the backend's query selects
and say so.

The answers of `GET /pools/:poolId/activity` were recorded from the live backend (`backend`
`fab3c76`, the first day the route was served) on 30 Sep 2026 at 08:05 UTC, and only re-indented:

| File | Request | Status |
|---|---|---|
| `pool-activity-eth-usdg.json` | `GET /pools/0xbac3…e551/activity?limit=25` | 200 |
| `pool-activity-eth-usdg-borrow.json` | `GET /pools/0xbac3…e551/activity?limit=25&kind=borrow` | 200 |
| `pool-activity-not-listed.json` | `GET /pools/0x54f7…ba32/activity?limit=25`, a pool that is not listed | 404 |
| `pool-activity-kind-refused.json` | `GET /pools/0xbac3…e551/activity?limit=25&kind=supply` | 400 |

Both lists are empty: no position had been deposited in either market. The tests build the rows
of a pool's history from the fields and the nulls the backend's service writes, and say so.

To record them again:

```sh
curl -s "$NEXT_PUBLIC_API_URL/markets" | jq . > markets.json
```
