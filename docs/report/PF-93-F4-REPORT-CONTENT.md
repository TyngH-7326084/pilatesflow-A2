# PF-93 — F4 report content

Owner: Likhit Raj Dundigal  
Feature: F4 — Reschedule & Concurrency-Safe Capacity  
Prepared: 15 October 2026

This file contains copy-ready text for the shared Assessment 2 report. Figure numbers should be assigned after screenshots are inserted.

## 1.2 Functional Requirements — F4

All requirements below are newly implemented in Assessment 2.

| ID | Requirement | Jira |
|---|---|---|
| F4-01 | The system shall allow an authenticated member to reschedule their own future booking to a different eligible future class while retaining the existing booking identity. | US4.1 (PF-46) |
| F4-02 | The system shall validate rescheduling on the server and reject malformed identifiers, unauthorised access, missing records, same-class moves, full destinations, duplicate bookings, past classes and unpublished classes without changing the original booking. | US4.2 (PF-47) |
| F4-03 | The system shall enforce class capacity atomically when ordinary bookings and reschedules occur concurrently, so successful bookings never exceed the destination class capacity and rejected reschedules retain their source booking. | US4.3 (PF-48) |
| F4-04 | The system shall present eligible reschedule destinations with class name, instructor, date/time and remaining availability; it shall exclude the current class, classes already booked by the member, past, unpublished and full classes. | US4.4 (PF-49) |

## 1.3 Non-Functional Requirement — F4

| ID | Requirement | Jira |
|---|---|---|
| NFR-F4 | **Reliability and data integrity:** across 10 independently reset trials, 20 simultaneous authenticated requests shall compete for a published class with five free places. Exactly five requests shall succeed in each trial; the remaining 15 shall return documented capacity conflicts. No trial may exceed capacity, create a duplicate member/class booking, or change the source booking of a rejected reschedule. | PF-50 |

PF-50 verifies this measurable threshold against a disposable MongoDB replica set because MongoDB transactions require replica-set support. The test combines ten ordinary booking requests and ten reschedule requests in every trial, so it verifies the shared capacity rule across both write paths.

## 1.4.4 User Stories and Acceptance Criteria — F4

| ID | User story | Acceptance criteria |
|---|---|---|
| US4.1 (PF-46) | As a member, I want to move my booking to another eligible class so that I can change my attendance without creating a second booking. | Given the member owns a booking in a future published class and chooses another future published class with space, rescheduling succeeds, retains the booking ID and member, and changes only the booked class. A same-class request is rejected with no data change. My Bookings refreshes after success and displays a clear result message. |
| US4.2 (PF-47) | As a member, I want an invalid or unsuccessful move to leave my booking intact so that I do not lose my original place. | Missing authentication returns 401 and another member’s booking returns 403. Malformed identifiers return 400; missing records return 404; full, duplicate, past or unpublished destinations return 409. A simulated failure after the booking update rolls back the move, leaving the source booking and capacity unchanged. |
| US4.3 (PF-48) | As a member, I want capacity enforced consistently so that every confirmed booking corresponds to an available place. | When concurrent ordinary bookings and reschedules compete for the final places, only the number allowed by capacity succeeds. Rejected reschedules keep their source bookings, duplicate member/class bookings are not created, and capacity is not exceeded. Booking, cancellation and rescheduling use the same database capacity service. |
| US4.4 (PF-49) | As a member, I want to select from eligible destination classes and understand why a move fails so that I can reschedule without guessing class identifiers. | My Bookings offers an accessible reschedule control and shows destination name, instructor, date/time and available places. The current, already-booked, past, unpublished and full classes are excluded. Repeat submission is disabled while pending; cancelling makes no API request. If availability changes before submission, the original booking remains and the options refresh. |

## 1.6 Requirements Changes and Evolution — F4 entry

During Sprint 3, CI detected an integration conflict between F3 and F4. F3 initially gave every class a required default status of `Draft`, while F4 treated only `Published` classes, plus legacy classes without a status, as bookable. The F4 concurrency test consequently recorded zero successful bookings instead of five. The team agreed that the new F3 field would remain optional during migration and that an absent status would be treated as legacy `Published`. PR #25 added a regression test for a no-status legacy class while continuing to reject explicit non-Published states. CI then passed before the F3 pull request was merged. This change preserved existing F1 class creation and F4 booking behaviour until the publish workflow was available.

## 1.7 Traceability Matrix — F4 rows

| Requirement | Priority | Jira | GitHub | Verification |
|---|---|---|---|---|
| F4-01 | High | US4.1 (PF-46) | `feature/pf-46-reschedule-booking`, PR #11 | Postman success and same-class rejection; `f4-reschedule.test.js`; deployed UI demonstration |
| F4-02 | High | US4.2 (PF-47) | `feature/pf-47-reschedule-validation`, PR #12 | Automated 400/403/404/409 and rollback tests; CI server-test artifact |
| F4-03 | High | US4.3 (PF-48) | `feature/pf-48-concurrency-capacity`, PR #13 | Mixed booking/reschedule concurrency tests; transaction rollback; capacity and duplicate invariants |
| F4-04 | High | US4.4 (PF-49) | `feature/pf-49-reschedule-destinations`, PR #14 | Eligible-destination automated test; My Bookings UI demonstration; accessibility label and error-state checks |
| NFR-F4 | Medium | PF-50 | `feature/pf-50-concurrency-integrity`, PR #15 | 10 trials × 20 concurrent authenticated requests; exactly 5 successes and 15 conflicts per trial; zero invariant violations |
| F4 test evidence in CI | Medium | PF-51 | `feature/pf-51-f4-tests-ci`, PR #16 | `npm test` runs both F4 suites; terminal output uploaded as a GitHub Actions artifact |
| F4 load test | Medium | PF-92 | `feature/pf-92-f4-load-test-evidence`, PR #40 | ApacheBench baseline and high-load results through the ALB; zero failed requests; 15/15 traffic split across two targets |

Links:

- Jira epic: <https://connect-team-vrnp386s.atlassian.net/browse/PF-4>
- PR #11: <https://github.com/TyngH-7326084/pilatesflow-A2/pull/11>
- PR #12: <https://github.com/TyngH-7326084/pilatesflow-A2/pull/12>
- PR #13: <https://github.com/TyngH-7326084/pilatesflow-A2/pull/13>
- PR #14: <https://github.com/TyngH-7326084/pilatesflow-A2/pull/14>
- PR #15: <https://github.com/TyngH-7326084/pilatesflow-A2/pull/15>
- PR #16: <https://github.com/TyngH-7326084/pilatesflow-A2/pull/16>
- F3/F4 regression fix, PR #25: <https://github.com/TyngH-7326084/pilatesflow-A2/pull/25>
- Load-test evidence, PR #40: <https://github.com/TyngH-7326084/pilatesflow-A2/pull/40>

## 2.1.4 Command Pattern — F4 Design Pattern (Likhit)

**Relevance to the project.** Rescheduling is a business operation with an actor, an existing booking and a destination class. It must apply authentication and ownership rules, validate both classes, reserve capacity atomically, update the existing booking and preserve the original state if any step fails. The Command pattern encapsulates this request as an object with a single `execute()` operation (Gamma et al., 1994).

**Association with requirements.** `RescheduleBookingCommand` directly implements F4-01/US4.1. The controller creates the command from the authenticated user ID, route booking ID and request-body destination ID, then invokes `execute()`. The command delegates the transaction to `BookingService`, which implements the F4-02 validation and F4-03 capacity rules. This separates HTTP concerns from the use case and gives the reschedule operation an explicit boundary.

**Code reference.** `server/src/commands/RescheduleBookingCommand.js` stores `actorId`, `bookingId`, `targetClassId` and a `bookingService`. Its `execute()` method calls `bookingService.rescheduleBooking(...)`. `server/src/controllers/bookingController.js` constructs the command for `PATCH /api/bookings/:id/reschedule`. `server/src/services/BookingService.js` performs the transactional business operation.

**Justification.** A controller-only implementation would mix request parsing, validation, capacity management and persistence. The command makes the operation identifiable and testable, while dependency injection allows the same command to be tested with a controlled service. The design also leaves a clear extension point for audit logging, notifications or an undo policy without changing the route contract. For the current scope, execution stays synchronous and one command represents one complete reschedule.

Suggested screenshots:

1. `RescheduleBookingCommand.js` showing the constructor and `execute()`.
2. `bookingController.js` showing command construction from `req.user`, `req.params` and `req.body`.
3. `BookingService.js` showing the transaction, deterministic class locking, validation and booking update.

## 2.2.4 F4 — Encapsulation, Abstraction and Dependency Injection (Likhit)

F4 applies encapsulation by keeping rescheduling rules inside `BookingService`. Controllers cannot directly alter booking or capacity data; they call the service through the command. `BookingServiceError` also packages an HTTP-compatible status with a useful domain message, so validation failures follow one consistent contract.

Abstraction is provided by `CapacityService`. `BookingService` requests `lockClasses()` and `countBookings()` without depending on how the database serialises competing writes. `CapacityService` sorts unique class IDs before incrementing `capacityVersion`, giving booking and rescheduling a consistent lock order and reducing deadlock risk. Both write paths therefore use the same capacity abstraction.

Dependency injection appears in the `BookingService` constructor. Models, the clock, transaction runner, capacity service and post-commit callbacks are supplied as dependencies. Production uses Mongoose transactions and the real models, while tests inject a fixed clock and controlled callbacks. This supports isolated tests for validation and rollback without weakening the production transaction.

These principles support F4-02, F4-03 and NFR-F4: rules are centralised, database mechanics are hidden behind a small service interface, and dependencies can be controlled during verification. The result is easier to test and less likely to develop inconsistent capacity rules across booking, cancellation and rescheduling.

Suggested code screenshots: `BookingService` constructor and `BookingServiceError`; `CapacityService.lockClasses()` and `countBookings()`; the `runInTransaction` call in `rescheduleBooking()`.

## 3.4 API Testing — F4

The Postman collection contains two authenticated requests for `PATCH /api/bookings/:id/reschedule`:

- **Reschedule booking (success):** sends a valid `targetClassId` for a booking owned by the signed-in member. Expected result: HTTP 200, message `Booking rescheduled successfully.`, unchanged booking ID and a new populated class.
- **Reschedule booking (same class rejection):** sends the booking’s current class as `targetClassId`. Expected result: HTTP 400 with `Choose a different class to reschedule.` and no booking change.

The collection is version controlled under `postman/collections/PilatesFlowA2/F4- Reschedule/`. Automated API-level tests provide the wider error coverage: invalid IDs (400), ownership (403), missing records (404), full/duplicate/past/unpublished destinations (409), and transaction rollback. This combination provides readable request/response evidence and repeatable regression coverage.

Suggested figures: the successful Postman request and response; the same-class 400 response; the F4 folder in the version-controlled collection.

## 4 Functional Testing — F4 contribution

`server/test/f4-reschedule.test.js` verifies the command/service behaviour, including successful movement, unchanged booking identity, same-class rejection, full destination, malformed IDs, missing records, ownership, duplicate bookings, past and unpublished classes, legacy classes without status, transaction rollback and destination filtering. It also races two members for the final place and asserts that exactly one succeeds.

`server/test/f4-concurrency.integration.test.js` verifies NFR-F4 through authenticated Express endpoints and a MongoDB in-memory replica set. Each of ten reset trials sends twenty simultaneous requests: ten ordinary bookings and ten reschedules, competing for five places. Every trial asserts five successes, fifteen HTTP 409 capacity conflicts, five destination bookings, no duplicate member/class pair and preservation of every rejected reschedule’s source booking.

The CI workflow executes these suites through `npm run test:f4` as part of `npm test`. Terminal output is retained in the `server-test-evidence-<commit>` GitHub Actions artifact, so failed functional or concurrency behaviour prevents packaging and deployment.

## 6 Load Testing — PF-92 F4 contribution

PF-92 tested the authenticated read-only endpoint `GET /api/bookings/:bookingId/reschedule-options` through the public ALB. A dedicated member and booking were used and removed after the run. The baseline profile (`-n 200 -c 10 -k -l`) completed 200 requests with zero failures at 15.22 requests/second, a 901 ms median and a 1,025 ms 95th percentile. The high-load profile (`-t 45 -n 100000 -c 100 -k -l`) completed 842 requests with zero failures at 18.64 requests/second, a 5,019 ms median and a 7,036 ms 95th percentile.

Increasing concurrency tenfold improved throughput by only 22.5%, while median latency rose by approximately 457%. The endpoint remained reliable, but this latency increase shows saturation in the database/query path under the higher load. A separate 30-request sample returned 15 responses from each EC2 instance, confirming balanced routing across both healthy targets. Mutation integrity was assessed separately by PF-50 rather than repeatedly changing shared production data during ApacheBench testing.

Raw evidence is version controlled in `docs/load-testing/pf-92/` and was merged through PR #40.

## 9.1 GenAI Disclosure — Likhit entries

| Date | Tool | Use | Human verification and changes |
|---|---|---|---|
| 20–27 Sep 2026 | OpenAI Codex | Helped structure the F4 Jira stories, acceptance criteria, Command pattern boundary and initial implementation plan. | Requirements were checked against the assessment rubric and team scope; Jira identifiers and sprint allocation were reviewed before use. |
| 27 Sep–3 Oct 2026 | OpenAI Codex | Assisted with implementation drafts for rescheduling, capacity handling, UI workflow and automated tests. | Code was reviewed in GitHub, exercised locally, tested with Postman and merged only after GitHub Actions passed. Error cases and rollback assertions were added to verify behaviour rather than relying on generated explanations. |
| 5 Oct 2026 | OpenAI Codex | Assisted in diagnosing the F3/F4 CI failure after the new class-status field was introduced. | The CI response pattern was inspected; the team agreed on legacy no-status behaviour; a regression test was added; PR #25 was merged only after all checks passed. |
| 11 Oct 2026 | OpenAI Codex | Assisted with the PF-92 ApacheBench procedure, evidence organisation and results calculation. | Both ALB targets were checked as healthy, the endpoint was manually validated, raw `ab` outputs were retained, traffic distribution was measured, and the dedicated booking was cleaned up. |
| 15 Oct 2026 | OpenAI Codex | Assisted in consolidating verified Jira, GitHub, test and load-test evidence into the F4 report draft. | Every claim was cross-checked against merged code, CI results and repository evidence; placeholders remain for the team’s final figure numbering and screenshots. |

## 9.2.2 Individual Reflection — Likhit Raj Dundigal

My main challenge was protecting booking capacity while F4 interacted with features owned by other members. Rescheduling releases one place and consumes another, so a partial failure or two concurrent requests could lose a member’s original booking or overbook the destination. I responded by moving capacity checks into a shared `CapacityService`, executing the reschedule inside a MongoDB transaction, locking classes in a deterministic order and verifying both ordinary bookings and reschedules in the same concurrency test. PF-50 provided concrete evidence: across ten trials of twenty simultaneous requests for five places, each trial produced exactly five successes and fifteen capacity conflicts, with no duplicate bookings or lost source bookings.

CI also exposed an F3/F4 integration issue when a new `Draft` default caused all F4 requests to be rejected. I worked with Riaz and Tyng to define backward-compatible status behaviour, updated the F4 fixture and added a legacy no-status regression test before the F3 work was merged. This showed me that shared model contracts should be agreed before implementation, especially when separate features modify the same entity. In a future project I would document those contracts in Jira at the start of the sprint and add a small cross-feature integration suite earlier, rather than discovering the mismatch during pull-request integration.

## Reference to add to Section 10

Gamma, E., Helm, R., Johnson, R., & Vlissides, J. (1994). *Design patterns: Elements of reusable object-oriented software*. Addison-Wesley.
