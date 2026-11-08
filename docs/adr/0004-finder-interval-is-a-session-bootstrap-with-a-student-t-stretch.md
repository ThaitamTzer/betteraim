# The Finder's confidence interval is a Session bootstrap, widened by a Student-t correction

The interval around the Curve Peak (the one the AI Coach chooses inside, and that decides "enough data" and when the Finder moves from the coarse to the fine phase) is a percentile bootstrap over Sessions: resample whole Sessions, redo the whole fit on each resample (spread, weights, quadratic), and take the 5th to 95th percentile of the resampled peaks. Because a few Sessions are all there is, that interval is then stretched about the Curve Peak by sqrt(S / (S - 1)) x t / z, where S is the number of Sessions, t and z are the 95th percentiles of Student's t on S - 1 degrees of freedom and of the normal.

## Why the stretch

A plain percentile interval is too narrow with few Sessions: resampling S clusters understates the spread of the peak by the factor (S - 1) / S in variance, and the peak's distribution has the heavy tails of a t, not a normal. On the repo's synthetic player (true optimum 33 cm/360, coarse levels around 40) the plain interval covered the true optimum 73% of the time at 5 Sessions (about half the time from 3 Sessions) against a nominal 90%. Stretched, it covers 88-89% at 5 and 8 Sessions and about 85%, 89%, 91% at 2, 3 and 4 Sessions. The stretch is a calibration fitted to that synthetic player, not a derivation, and has not been checked against real players.

## Considered Options

- **Plain percentile bootstrap**: rejected, covers 73% at 5 Sessions.
- **Bootstrap over Runs**: rejected by the spec. The Runs of a Session share the day's form (one offset per Session and Scenario), so they are not independent; Sessions are the unit that repeats.

## Consequences

- Early intervals are wide on purpose. The fine phase starts at a half-width under 25% (`FINE_HALF_WIDTH`), "enough data" at under 10% (`ENOUGH_HALF_WIDTH`), and the AI Coach's guardrail accepts any answer inside the interval, so all three consume this width: a more generous stretch makes the Finder ask for more Sessions and gives the AI Coach more room.
- The interval is **not clamped** to the tested range. A peak near an edge reports an interval that reaches or leaves it, and "enough data" needs the interval strictly inside the tested range as well as under +-10%, so a peak the data cannot pin down never reads as settled. The AI Coach is only allowed to choose inside the interval cut to the tested range.
- One Session gives a Curve Peak but **no interval** (nothing to resample); the screen asks for one more Session.
- Known limit, left to a product decision: there is no minimum number of Sessions for "enough data". The interval's coverage is fine overall, but conditional on the flag being raised it is often wrong after 2 to 3 Sessions (in simulation 19 of 36 flags at 3 Sessions missed the true optimum), because only the lucky draws look narrow.
- Reset Finder is permanent: its marker is a time per Game Profile and the later of two markers always wins, even over an older marker that arrives with an import. A Reset is never undone by importing a file made before it.
