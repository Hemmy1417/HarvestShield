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

## Mutation sweeps

`tests/mutation/mutate.py` breaks 52 rules of the contract one at a time, and the suite must fail for each; `web/tests/mutation/mutate.mjs` does the same for the interface's act rules and words.

## Limits that remain

- Reanalysis datasets estimate rain on a grid; they are not a gauge at the farm.
- The payout is fixed; there are no tiers.
- A contest bond follows its own round; a later appeal does not reverse it.
- The decision's reasons are the leading validator's words; validators bind only the verdict.
- After the grace period, a dataset that never fills a missing day leaves the other to decide alone, and the reading cannot then be contested.
- Photographs are described by models, which can be fooled by a staged or borrowed picture; each is described blind to the claims, and the clause and the recorded series still decide.
- A filed page is whatever its host served when filed; the app links it, but later changes do not reach the record.
- A forward window may start the day after purchase; an insurer manages that exposure with its thresholds and by closing a product.
