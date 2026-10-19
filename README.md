<p align="center"><img src="https://raw.githubusercontent.com/Hemmy1417/HarvestShield/main/web/public/icon.svg" width="140" alt="HarvestShield"/></p>

# HarvestShield - parametric crop cover with a fair hearing on the reading

**Rainfall read from two independent public datasets under consensus, and a disputed reading decided by GenLayer validators against the clause both sides signed.**

An insurer publishes cover for a crop at a point: pay a fixed amount if rain over a window falls below (or rises above) a threshold. When the window ends, every validator fetches the rain from Open-Meteo and from NASA POWER itself and must reproduce the same numbers; a fixed rule picks which one governs. When the two datasets land on opposite sides of the threshold, the side the reading went against may contest it, and the validators decide which reading governs under the policy's own dispute clause. Code does the money.

Live app: **[harvest-shield.vercel.app](https://harvest-shield.vercel.app/)**

## What it is

- **Two independent datasets** - Open-Meteo's archive (ERA5 reanalysis) and NASA POWER (MERRA-2), from a fixed registry; the contract builds the URLs, so no party picks the source.
- **A reading no model touches** - parsed in code to whole tenths of a millimetre per day; every validator must match the leader's series exactly.
- **A contest only where there is a real disagreement** - refused when both datasets put the season on the same side of the threshold.
- **A decision on the recorded data** - validators apply the written dispute clause to the series the reading agreed, never a fresh fetch, and must agree on one of three verdicts.
- **Evidence from the field** - while a contest or an appeal is open, each side may file up to two photographs (held on chain, byte for byte) and two public pages (read by every validator when filed). The validators weigh them, with the recorded series, against the clause.
- **Reserved payouts and a pull ledger** - each sale reserves its payout from the insurer's funding; nothing waits forever.

## How it works

### For the farmer

1. Pick a product: crop, point, threshold, window, premium, payout, the two datasets and the dispute clause are all shown.
2. Buy a policy for a window that starts after today, paying the premium into the contract.
3. After the window, anyone asks for the reading. If the trigger fires, the payout is yours once the contest period passes.
4. If the reading goes against you and the datasets disagree, contest it with a bond and say why under the clause. Add photographs of the field or a public report while the contest is open.
5. Draw what you are owed from the bar at the top.

### For the insurer

1. Publish a product and fund it; each sale reserves one payout, and unreserved funding can be withdrawn at any time.
2. Answer a farmer's contest, or contest a reading that pays when the other dataset says it should not.
3. Appeal a decision that left you short of your best outcome.
4. Close a product to new sales; policies already sold run to the end.
5. Draw premiums as policies settle.

## Verdicts

| Verdict | Meaning | Money |
|---|---|---|
| `STANDS` | Under the clause, the selected reading governs | Pays the farmer if it triggered, otherwise releases the reserve |
| `USE_OTHER` | Under the clause, the other dataset governs | Pays the farmer if the other dataset triggers, otherwise releases the reserve |
| `NO_RELIABLE_READING` | Under the clause, neither can be relied on | Void: the premium goes back to the farmer and the reserve to the insurer |

Where the clause is silent, the selected reading stands. A contest that moves the outcome the contestant's way (a reversal or a void) returns the bond; one that does not pays it to the other side. The same rule applies to an appeal.

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
| Read | `contest` by the side it went against, if the datasets disagree; `finalize` after the contest period |
| Contested | `answer` by the other side; `file_photo` / `file_page` by either side until the response period ends; `decide_contest` after it; `lapse_contest` after the long stop |
| Decided | `appeal` by a side short of its best outcome; `finalize` after the appeal window |
| Appealed | `answer`, `file_photo`, `file_page` during the appeal's period; `decide_appeal` after it; `lapse_appeal` after the long stop |

The grace period and the read long stop run from the end of the window or the purchase, whichever is later.

## GenLayer consensus functions

| Function | Kind | What runs under consensus |
|---|---|---|
| `read_index` | `gl.vm.run_nondet` | Each node fetches both datasets from URLs the contract builds and parses them to integer tenths per day; validators must reproduce the leader's two series exactly. Selection and threshold are code. |
| `file_page` | `gl.vm.run_nondet` | Each node renders the public page itself; the leader's text is kept only if it is the start of every validator's own reading, and not much shorter. |
| `decide_contest` / `decide_appeal` | `gl.vm.run_nondet` | Each node describes each photograph on its own, blind to the claims, then applies the policy's dispute clause to the recorded series (totals, daily pairs, large daily differences), the evidence and both parties' statements; validators must agree on the verdict. |

## Contract

| | |
|---|---|
| Network | GenLayer Studio Next, chain 61997 |
| RPC | `https://studio-dev.genlayer.com/api` |
| Deployment of record | [`0xEE527C8caE9B1D7B543ADA775E4054E9b49ab6e6`](https://explorer-studio-dev.genlayer.com/address/0xEE527C8caE9B1D7B543ADA775E4054E9b49ab6e6) |
| Source | [`contracts/harvestshield.py`](contracts/harvestshield.py), sha256 `99d43462d90ac969a4091d239c25c6d84dd75e3d0d31caae3f7e01786299ef65`, verified byte for byte |

### Write methods

| Method | Who | Payable | Notes |
|---|---|---|---|
| `create_product` | Insurer | | Point, trigger, threshold, window, premium, payout, capacity, datasets, clause, periods, replay season |
| `fund_product` | Insurer | Yes | Refusals return and credit back |
| `withdraw_capital` | Insurer | | Only funding no policy has reserved |
| `close_product` | Insurer | | Stops new sales |
| `buy_policy` | Farmer | Yes, the exact premium | Reserves the payout |
| `read_index` | Anyone | | Consensus reading |
| `void_unread` | Anyone, after the long stop | | Premium back, reserve released |
| `contest` | The side the reading went against | Yes, the bond | Only when the datasets disagree |
| `answer` | The other side | | Once, inside its period |
| `decide_contest` | Either party | | Consensus decision |
| `lapse_contest` | Anyone, after the long stop | | The reading stands, the bond returns |
| `appeal` | A side short of its best outcome | Yes, the bond | Once |
| `decide_appeal` | Either party | | Consensus decision; settles |
| `lapse_appeal` | Anyone, after the long stop | | The decision stands, the bond returns |
| `finalize` | Anyone, after the period | | Settles a reading or a decision |
| `claim` | Anyone owed | | The only method that sends value |

### Read methods

`get_config`, `get_stats`, `list_products`, `products_of`, `get_product`, `list_policies`, `policies_of`, `get_policy`, `get_balance`, `source_url`.

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
