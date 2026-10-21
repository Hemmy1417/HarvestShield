<p align="center"><img src="https://raw.githubusercontent.com/Hemmy1417/HarvestShield/main/web/public/icon.svg" width="140" alt="HarvestShield"/></p>

# HarvestShield - parametric crop cover with a fair hearing on the reading

**Rainfall read from two independent public datasets and, where one is near, a real rain gauge, under consensus; a disputed reading decided by GenLayer validators against the clause both sides signed, with satellite vegetation from the field in front of them.**

An insurer publishes cover for a crop at a point, in steps: a part of the payout for a dry season, more for a severe one, all of it for a failed one. Anyone can back the product's pool for shares, which earn the premiums and carry the payouts. When the window ends, every validator fetches the rain from Open-Meteo, from NASA POWER and from the named NOAA rain gauge itself, and must reproduce the same numbers; a fixed rule picks which dataset governs and code grades the season. When another reading grades the season differently, the side it would favour may contest, and the validators decide which reading governs under the policy's own dispute clause, with the satellite's view of the crop beside the rain. Code does the money.

Live app: **[harvest-shield.vercel.app](https://harvest-shield.vercel.app/)**

## What it is

- **Two independent datasets** - Open-Meteo's archive (ERA5 reanalysis) and NASA POWER (MERRA-2), from a fixed registry; the contract builds the URLs, so no party picks the source.
- **A reading no model touches** - parsed in code to whole tenths of a millimetre per day; every validator must match the leader's series exactly.
- **Graded payouts** - up to four steps per product, each a threshold and a share of the payout, so a season just past the line pays a little and a failed season pays in full.
- **A pool anyone can back** - capital comes in for shares at the pool's value; every premium and forfeited bond is earned by the pool and every payout comes out of it, so backers share both in proportion; any backer redeems capital no policy has reserved.
- **A real rain gauge** - an insurer may name a NOAA GHCN-Daily station; validators read it beside the datasets, the contract checks from the archive's own coordinates that it is within 50 km, and a gauge that reports every day grades the season too.
- **Satellite vegetation** - anyone can ask the validators to record the MODIS vegetation index at the point for the window and the same weeks in three earlier seasons, keeping only composites MODIS itself rates usable (not cloud). The judge weighs whether the crop was actually stressed.
- **A contest only where there is a real disagreement** - refused unless another reading (the other dataset, or the gauge) grades the season better for the side contesting.
- **A decision on the recorded data** - validators apply the written dispute clause to the series the reading agreed, never a fresh fetch, and must agree on one of three verdicts.
- **Evidence from the field** - while a contest or an appeal is open, each side may file up to two photographs (held on chain, byte for byte) and two public pages (read by every validator when filed). The validators weigh them, with the recorded series, against the clause.
- **Reserved payouts and a pull ledger** - each sale reserves its payout from the pool; nothing waits forever.

## How it works

### For the farmer

1. Pick a product: crop, point, payout steps, window, premium, payout, the two datasets, any rain gauge and the dispute clause are all shown.
2. Buy a policy for a window that starts after today, paying the premium into the contract.
3. After the window, anyone asks for the reading. The step the season reaches is paid to you once the contest period passes.
4. If another reading grades the season higher, contest with a bond and say why under the clause. Ask for the satellite vegetation reading, and add photographs of the field or a public report while the contest is open.
5. Draw what you are owed from the bar at the top.

### For the insurer

1. Publish a product: its steps, its datasets, an optional rain gauge, its clause. Back its pool, and invite others to.
2. Answer a farmer's contest, or contest a reading another reading grades lower.
3. Appeal a decision that left you short of your best outcome.
4. Close a product to new sales; policies already sold run to the end.
5. Premiums go to the pool; redeem shares for your part of it, as policies settle and reserves free up.

### For a backer

1. Open a product and add capital to its pool; you receive shares at the pool's current value.
2. Your shares rise with the premiums the pool earns and fall with the payouts it makes.
3. Redeem any time, from capital no live policy has reserved.

## Verdicts

| Verdict | Meaning | Money |
|---|---|---|
| `STANDS` | Under the clause, the selected reading governs | Pays its grade's share of the payout from the pool; the rest of the reserve is released |
| `USE_OTHER` | Under the clause, the other dataset governs | Pays the other dataset's grade |
| `USE_STATION` | Under the clause, the rain gauge governs (offered only when it graded the season) | Pays the gauge's grade |
| `NO_RELIABLE_READING` | Under the clause, no reading can be relied on | Void: the premium goes back to the farmer and the reserve to the pool |

Where the clause is silent, the selected reading stands. A contest that leaves the contestant better off in GEN returns the bond to them; one that does not pays it to the other side (the farmer, or the pool). The same rule applies to an appeal.

## Lifecycle

```text
ACTIVE --read_index--> READ --contest--> CONTESTED --decide_contest--> DECIDED --appeal--> APPEALED
  |                     |                    |                           |                    |
void_unread          finalize          lapse_contest                 finalize      decide_appeal / lapse_appeal
  v                     v                    v                           v                    v
 VOID                SETTLED              SETTLED                  SETTLED or VOID      SETTLED or VOID
```

| State | Leaves by |
|---|---|
| Active | `read_index` once the window has ended and both datasets cover it (one alone after a 10-day grace); `void_unread` after a 45-day long stop |
| Read | `contest` by a side another reading grades better for; `read_vegetation` by anyone; `finalize` after the contest period |
| Contested | `answer` by the other side; `file_photo` / `file_page` by either side and `read_vegetation` by anyone until the response period ends; `decide_contest` after it; `lapse_contest` after the long stop |
| Decided | `appeal` by a side short of its best outcome; `finalize` after the appeal window |
| Appealed | `answer`, `file_photo`, `file_page`, `read_vegetation` during the appeal's period; `decide_appeal` after it; `lapse_appeal` after the long stop |

The grace period and the read long stop run from the end of the window or the purchase, whichever is later. A named rain gauge is read only until the grace period ends, so an archive that never answers cannot hold a policy back.

## GenLayer consensus functions

| Function | Kind | What runs under consensus |
|---|---|---|
| `read_index` | `gl.vm.run_nondet` | Each node fetches both datasets, and the named NOAA gauge, from URLs the contract builds and parses them to integer tenths per day; validators must reproduce the leader's series and the gauge's distance exactly. Selection and grading are code. |
| `read_vegetation` | `gl.vm.run_nondet` | Each node fetches the MODIS vegetation index and its pixel reliability for the window and three earlier seasons; validators must reproduce the leader's usable composites exactly. Means, baseline and anomaly are code. |
| `file_page` | `gl.vm.run_nondet` | Each node renders the public page itself; the leader's text is kept only if it is the start of every validator's own reading, and not much shorter. |
| `decide_contest` / `decide_appeal` | `gl.vm.run_nondet` | Each node describes each photograph on its own, blind to the claims, then applies the policy's dispute clause to the recorded series, the gauge, the vegetation record, the evidence and both parties' statements; validators must agree on the verdict. Every round records the digests of what it weighed. |

## Contract

| | |
|---|---|
| Network | GenLayer Studio Next, chain 61997 |
| RPC | `https://studio-dev.genlayer.com/api` |
| Deployment of record | [`0xEE527C8caE9B1D7B543ADA775E4054E9b49ab6e6`](https://explorer-studio-dev.genlayer.com/address/0xEE527C8caE9B1D7B543ADA775E4054E9b49ab6e6) |
| Source | [`contracts/harvestshield.py`](contracts/harvestshield.py), sha256 `8215c6681cceb48742f8ff14eef1c435ac6cd025e77563713e5b2403732b384e`, verified byte for byte |

### Write methods

| Method | Who | Payable | Notes |
|---|---|---|---|
| `create_product` | Insurer | | Point, trigger, payout steps, window, premium, payout, capacity, datasets, optional NOAA gauge, clause, periods, replay season |
| `deposit` | Anyone | Yes, at least 0.01 GEN | Shares in the product's pool at its current value; refusals return and credit back |
| `withdraw` | A backer | | Redeems shares for their part of the pool, from capital no policy has reserved |
| `close_product` | Insurer | | Stops new sales |
| `buy_policy` | Farmer | Yes, the exact premium | Reserves the payout |
| `read_index` | Anyone | | Consensus reading of both datasets and the gauge; grades the season |
| `read_vegetation` | Anyone, while the reading can be contested or decided | | Consensus reading of the MODIS vegetation index; recorded once |
| `void_unread` | Anyone, after the long stop | | Premium back, reserve released |
| `contest` | A side another reading grades better for | Yes, the bond | Only when another reading grades the season differently |
| `answer` | The other side | | Once, inside its period |
| `decide_contest` | Either party | | Consensus decision |
| `lapse_contest` | Anyone, after the long stop | | The reading stands, the bond returns |
| `appeal` | A side short of its best outcome | Yes, the bond | Once |
| `decide_appeal` | Either party | | Consensus decision; settles |
| `lapse_appeal` | Anyone, after the long stop | | The decision stands, the bond returns |
| `finalize` | Anyone, after the period | | Settles a reading or a decision |
| `claim` | Anyone owed | | The only method that sends value |

### Read methods

`get_config`, `get_stats`, `list_products`, `products_of`, `get_product`, `get_backer`, `products_backed_by`, `list_policies`, `policies_of`, `get_policy`, `get_balance`, `source_url`.

## Replay products

A product can be a replay of one finished season, named by the insurer when it is published. It lets the whole path run on real, finished weather; a farmer cannot choose another season. The app labels replays wherever they appear.

## Verified end-to-end

See [`docs/live-proof.md`](docs/live-proof.md): the live run on the deployment of record against Abuja, 1 to 14 August 2026, where Open-Meteo reads 163.0 mm and NASA POWER 117.2 mm against a 140 mm drought threshold.

## Tech stack

| Layer | Tools |
|---|---|
| Contract | Python on GenVM, `gl.nondet.web.get`, `gl.nondet.exec_prompt` |
| Tests | pytest direct mode with stubbed fetches, random invariant walks, mutation sweeps |
| App | Next.js 16, React 19, Tailwind 4, genlayer-js 2.0.0-rc.1, Transaction Kit 0.1.0-rc.2 |

## Getting started

```bash
pip install -r requirements.txt
```

```bash
python -m pytest tests/direct -q
```

```bash
cd web && pnpm install && pnpm dev
```

## Security

Three adversarial review rounds ran before the deployment of record; see [`docs/security.md`](docs/security.md).

## Disclaimer

A demonstration on a test network. Reanalysis datasets are estimates, not gauges; real cover needs datasets, thresholds and terms agreed for each market.
