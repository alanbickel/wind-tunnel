# Fidelity: Where Wind Tunnel Differs From AWS

Wind Tunnel's components should behave as their AWS services do: AWS behavior is the default. Every known difference is a gap, to close or to accept with a reason; none is a simplification chosen for its own sake. These pages list each gap, what AWS actually does, how sure we are, which way it skews the results, and what closing it needs first, so the work to close them can be planned and reviewed from one list.

For the model itself, see the [MVP design](mvp-design.md) and the [component definitions guide](../architecture/component-definitions.md). Work to close a gap is tracked as a GitHub issue; these pages hold the detail.

## How to read an entry

Each entry has an ID (e.g. `LMB-2`; a prefix may hold digits after its first letter, as `S3-1` does) so code comments, commits, and issues can refer to it. Its first four fields track the gap, and `fidelity-entry-fields.test.ts` fails for an entry without them:

- **Status:** `Open`, a gap still to close, or `Accepted: <reason>`, one we've decided not to close, with the reason why (for example "Minor at any scale Wind Tunnel models"). An Open entry that looked like a candidate for Accepted may have a "Kept open:" note under its Status saying why it wasn't accepted. Both kinds of reason record the thinking when the decision was made, not a settled rule: if the evidence, the model, or the product has moved on, say so and propose a change.
- **Kind:** `Setting`, a setting AWS exposes that Wind Tunnel doesn't, or `Behavior`, how the service behaves under load. An entry that's both gets its main kind.
- **Depends on:** what has to exist before the gap can close (other entries, engine features, or Roadmap items), or "Nothing", and the Roadmap item that closes it, if there is one.
- **Checked:** the date, as `YYYY-MM-DD`, its evidence and links were last checked against AWS.

The rest describe the gap:

- **Wind Tunnel:** what the model does today.
- **AWS:** what the real service does.
- **Evidence:** how we know what AWS does.
  - **Documented:** stated in AWS documentation. The link is included, and it was checked on the entry's Checked date.
  - **Observed:** AWS doesn't publish it; the value comes from measurements by others. Treat it as approximate.
  - **Assumption:** our belief about AWS, not yet verified. Upgrade it when someone finds a source, or correct it.
- **Skew:** which way the difference moves results.
  - **Optimistic:** the model looks healthier than AWS would.
  - **Pessimistic:** the model looks worse than AWS would.
  - **Mixed:** depends on the scenario.
  - **Minor:** unlikely to change a lesson at MVP scale.
- **To close:** what it would take to model it.

Model defaults (the numbers in each definition's `defaultConfig`) are in each type's profile, in its [defaults table](fidelity/profile-spec.md#default-values-and-their-evidence).

## Differences that matter most for the templates

| ID | Difference | Skew | Template | Status |
|---|---|---|---|---|
| [LMB-8](fidelity/lambda/lambda-fidelity.md#lmb-8-rds-connections-are-held-per-invocation-not-per-environment) | RDS connections are held per invocation, not per execution environment | Optimistic | A | Open |
| [RDS-2](fidelity/rds/rds-fidelity.md#rds-2-database-capacity-is-a-fixed-pool-of-query-workers) | Database capacity is a fixed pool of workers with a clean plateau | Optimistic | A | Open |
| [RDS-4](fidelity/rds/rds-fidelity.md#rds-4-opening-a-connection-is-free) | Opening a connection is free | Optimistic | A | Open |
| [SQS-1](fidelity/sqs/sqs-fidelity.md#sqs-1-failed-messages-come-back-immediately) | Failed messages come back immediately, not after the visibility timeout | Mixed | B | Open |
| [SQS-3](fidelity/sqs/sqs-fidelity.md#sqs-3-the-consumer-reaches-full-concurrency-instantly) | The SQS consumer reaches full concurrency instantly | Optimistic | B | Open |
| [DDB-1](fidelity/dynamodb/dynamodb-fidelity.md#ddb-1-every-request-costs-one-capacity-unit) | Every DynamoDB request costs one capacity unit | Pessimistic for reads | B | Open |
| [DDB-4](fidelity/dynamodb/dynamodb-fidelity.md#ddb-4-throttled-requests-fail-immediately) | Throttled DynamoDB requests fail immediately; AWS SDKs retry them | Mixed | B | Open |
| [LMB-1](fidelity/lambda/lambda-fidelity.md#lmb-1-concurrency-is-per-function-not-shared-by-the-account) | Lambda concurrency is per function, not shared by the account | Optimistic | B | Open |

---

## The service pages

Each component type has a folder of two pages: its profile, what AWS exposes and enforces and what the type starts with, and its entries, with IDs that start the same way. [A service's profile](fidelity/profile-spec.md) says what a profile holds and how to research one. The engine and edges aren't a type, so they have one page, with their entries and the edges' defaults.

- [Engine and edges](fidelity/engine-and-edges.md) (ENG)
- API Gateway (APIGW): [profile](fidelity/api-gateway/api-gateway-profile.md), [entries](fidelity/api-gateway/api-gateway-fidelity.md)
- Lambda (LMB): [profile](fidelity/lambda/lambda-profile.md), [entries](fidelity/lambda/lambda-fidelity.md)
- DynamoDB (DDB): [profile](fidelity/dynamodb/dynamodb-profile.md), [entries](fidelity/dynamodb/dynamodb-fidelity.md)
- RDS (RDS): [profile](fidelity/rds/rds-profile.md), [entries](fidelity/rds/rds-fidelity.md)
- SQS and the Lambda consumer (SQS): [profile](fidelity/sqs/sqs-profile.md), [entries](fidelity/sqs/sqs-fidelity.md)
- S3 (S3): [profile](fidelity/s3/s3-profile.md), [entries](fidelity/s3/s3-fidelity.md), the first researched profile

## Keeping this page current

- When a model differs from AWS, add an entry to its type's fidelity page in the same change, `Open` and checked today, and mention its ID in the code comment where the model differs. A new type gets a folder of its own in [`fidelity/`](fidelity/), with its [profile](fidelity/profile-spec.md) and its fidelity page, both listed above; `fidelity-pages.test.ts` fails for a page that isn't listed, for a folder without both, or for an ID that two entries share.
- When a gap is closed, delete the entry (git history keeps it) and update the code comment.
- Only the maintainer accepts a gap, or decides to keep one open. When they do, change its status to `Accepted:` with their reason, or add a "Kept open:" note with theirs. To challenge either reason, ask the maintainer; don't change the status on your own.
- When you recheck an entry's evidence and links, set its Checked date to that day, and correct what has changed.
- An Assumption becomes Documented only with a link to AWS documentation that states it. Re-check links before quoting them in the app; AWS quotas and behavior change.
- Facts worth teaching can also go in [AWS: Did you know?](../learning/aws-did-you-know.md).
