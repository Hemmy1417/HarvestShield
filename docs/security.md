# Security review

Three adversarial review rounds ran on the contract before the deployment of record. Each reviewer had not written it, was given the previous round's changes and told to attack them first, and had to prove every finding with a test that failed on the code it read. Those tests are in `tests/direct/test_audit.py`.

## Round 1

- **HIGH** A farmer could buy a replay policy for any finished season, including a known drought, and collect a payout that was certain to beat the premium. Now a replay product names its one season and nothing else can be bought.
- **MEDIUM** Reading the moment the window ended let one dataset decide before the other caught up, which also made a contest impossible. Now both datasets must be complete until a grace period ends.
- **MEDIUM** A contest re-fetched the datasets, so it could judge numbers the reading never recorded. Now every decision judges the series the reading recorded.
- **MEDIUM** A contestant whose claim ended void could not appeal. Now any side the outcome left short of its best may appeal.
- **MEDIUM** The insurer's crop and region text reached the prompt unfenced. Now fenced and defused.
- **LOW** NaN values and non-numeric paging raised bare errors. Now refused or read as missing.

## Round 2

- **MEDIUM** (x2) The grace period and the read long stop ran from the window's end, so a replay bought long after its season skipped both: it could be voided or read on one dataset the moment it was bought. Now both run from the end of the window or the purchase, whichever is later.

## Round 3

Clean: nothing above LOW. Its three notes (a stale comment, the grace length missing from `get_config`, wording) were applied.

## Round 4 (evidence)

- **HIGH** A leader could append words a page does not have, since a validator accepted either reading being the start of the other. Now the stored text must be the start of each validator's own reading.
- **MEDIUM** A leader could cut a page short before the part that matters. Now the stored text may be at most 300 characters shorter than a validator's reading.
- **MEDIUM** A decision could be asked for as soon as the other side answered, cutting off evidence still to come. Now a contest or an appeal is decided only after its whole period.

The fixes were then read again and the sweep extended to each of them.

## Version 2 (graded payouts, pools, rain gauge, vegetation)

What v2 adds was attacked the same way: each rule has a test that fails without it, and the sweep breaks each one.

- **HIGH** On the live network the vegetation baseline for Abuja came out far too low, because MODIS rates most rainy-season composites as cloud; the judge would have seen a healthy crop as a collapse. Now only composites MODIS rates good or marginal are kept, both bands are read under consensus, and the judge is told how many cloud left out. A window with nothing usable is refused rather than recorded.
- **MEDIUM** A round can finalize with its leader reporting success while the validators timed out, so nothing was written. The live proof now requires a majority on every round, not only a finalized transaction.
- **MEDIUM** A named gauge the archive never answers for could hold a policy back. Now the gauge is read only until the grace period ends, and is then left out.
- **MEDIUM** An insurer could name a gauge far from the field. Now the contract takes the station's coordinates from the archive itself and ignores it beyond 50 km; a gauge missing any day does not grade the season.
- **MEDIUM** With several grades a contest could be raised by a side that gains nothing. Now a contest needs another reading that grades the season better for the side contesting, and a bond is returned only when the outcome leaves that side better off in GEN.
- **LOW** Vegetation could be requested repeatedly to replace an unwelcome reading. Now it is recorded once, and only while the reading can still be contested or decided.
- **LOW** A dust deposit could mint shares at a rounding loss to other backers. Now deposits below 0.01 GEN are refused and credited back, and withdrawals come only from capital no policy has reserved.

## Mutation sweeps

`tests/mutation/mutate.py` breaks 70 rules of the contract one at a time, and the suite must fail for each; `web/tests/mutation/mutate.mjs` does the same for the interface's act rules and words.

## Limits that remain

- Reanalysis datasets estimate rain on a grid; a NOAA gauge helps only where one is within 50 km, and most farms have none.
- The vegetation index is weighed by the judge; it never sets a grade by itself.
- Backers carry the pool's losses in proportion; shares cannot be redeemed while capital is reserved for live policies.
- A contest bond follows its own round; a later appeal does not reverse it.
- The decision's reasons are the leading validator's words; validators bind only the verdict.
- After the grace period, a dataset that never fills a missing day leaves the other to decide alone, and the reading cannot then be contested.
- Photographs are described by models, which can be fooled by a staged or borrowed picture; each is described blind to the claims, and the clause and the recorded series still decide.
- A filed page is whatever its host served when filed; the app links it, but later changes do not reach the record.
- A forward window may start the day after purchase; an insurer manages that exposure with its thresholds and by closing a product.
