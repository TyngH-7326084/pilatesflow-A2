# PF-50 capacity-integrity verification

PF-50 verifies the F4 data-integrity requirement before the deployed ALB test. The automated test uses a disposable, single-node MongoDB replica set so that the same transactions used in production are exercised. It sends 20 simultaneous authenticated HTTP requests from distinct members to a class with five available places. Ten requests create bookings and ten reschedule existing bookings.

Run from `server/`:

```bash
npm test
```

The test resets the database and repeats the scenario ten times. Every trial must report:

- 20 requests;
- exactly five successful requests and 15 HTTP 409 capacity conflicts;
- exactly five target-class bookings;
- zero duplicate member/class booking groups;
- every rejected reschedule still linked to its original class; and
- no unexpected HTTP status, timeout, or server error.

The Node test diagnostics print these counts for each trial. PF-51 retains the terminal output in both the GitHub Actions log and a downloadable `server-test-evidence-<commit>` artifact for 14 days. The second PF-50 stage will repeat the concurrent request test through the ALB after PF-28 has two healthy deployed targets; PF-92 records the separate Apache Benchmark and CloudWatch evidence.
