# Recorded answers

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

To record them again:

```sh
curl -s "$NEXT_PUBLIC_API_URL/markets" | jq . > markets.json
```
