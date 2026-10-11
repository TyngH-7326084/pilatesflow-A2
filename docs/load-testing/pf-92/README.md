# PF-92 — F4 load test through the ALB

Date: 11 October 2026 (AEST)

## Scope and environment

This test benchmarks the authenticated, read-only F4 endpoint:

`GET /api/bookings/:bookingId/reschedule-options`

The endpoint calculates valid reschedule destinations for a booking. A dedicated member and booking were created for this test. The booking was cancelled after the tests. No mutation endpoint was benchmarked, so the load run did not create repeated reschedules or junk booking records.

Environment:

- ALB: `PilateFlow-A2-1904168369.ap-southeast-2.elb.amazonaws.com`
- Two EC2 targets in `ap-southeast-2a` and `ap-southeast-2b`
- Target group health check: `GET /api/health` over HTTP port 80
- Deployed revision: `752a04dc8d4637cff4a6bba742a6e48864a0206f`
- ApacheBench 2.3 with keep-alive (`-k`) and variable document length accepted (`-l`)

Before testing, both registered targets showed **Healthy** in AWS. A direct health request returned HTTP 200.

## Results

| Profile | Settings | Completed | Failed | Throughput | Mean time/request | Median | p95 | Longest |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Baseline | `-n 200 -c 10 -k -l` | 200 | 0 | 15.22 req/s | 656.819 ms | 901 ms | 1,025 ms | 1,857 ms |
| High load | `-t 45 -n 100000 -c 100 -k -l` | 842 | 0 | 18.64 req/s | 5,366.211 ms | 5,019 ms | 7,036 ms | 9,050 ms |

Increasing concurrency from 10 to 100 raised throughput by only 22.5% (15.22 to 18.64 req/s), while median latency increased by 457% (901 to 5,019 ms). The endpoint remained reliable with zero failed requests in both profiles, but the small throughput gain and large latency increase show that it saturated under the higher concurrency level. The result should be interpreted with the EC2 CPU and ALB CloudWatch graphs captured for the report; low CPU alongside this latency pattern would point to waiting on the database/query path rather than EC2 compute exhaustion.

## Load distribution and integrity evidence

A separate 30-request sample after the load run returned:

- 15 responses from `ip-172-31-100-140.ap-southeast-2.compute.internal`
- 15 responses from `ip-172-31-121-29.ap-southeast-2.compute.internal`

This confirms that the ALB routed F4 requests to both instances. The read-only load run did not alter capacity. F4 write integrity is verified separately by PF-50 / PR #15, which runs the concurrency harness and checks that capacity is never exceeded.

## Evidence files

- `ab-baseline.txt` — complete baseline ApacheBench output
- `ab-high-load.txt` — complete high-load ApacheBench output
- `traffic-split.txt` — response distribution by `X-Served-By`
