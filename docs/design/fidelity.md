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

Model defaults (the numbers in each definition's `defaultConfig`) are covered in [Default values and their evidence](#default-values-and-their-evidence).

## A service's profile

A new component type starts with its service's profile ([Adding a component type](../../CONTRIBUTING.md#adding-a-component-type)): what AWS exposes and enforces, researched before any code, so the type's settings, defaults, and limits come from AWS rather than from what was easy to build. It goes at the top of the service's page, under `## Profile`, before the entries, with a `Checked:` date for the whole profile. It's a research checklist: a row or a line per item, not prose.

- **Settings:** each setting AWS exposes that could change behavior under load, with AWS's default, its allowed range, and whether Wind Tunnel models it. One the type doesn't model is an entry of kind Setting, Open or Accepted with its reason; cite its ID in place of "yes".
- **Quotas:** each limit, with its default, whether it can be raised, and its scope: per resource, per account and Region, or per something smaller, such as a partition or a prefix. One the type doesn't enforce, or enforces at another scope, is an entry of kind Behavior, as [LMB-1](fidelity/lambda.md#lmb-1-concurrency-is-per-function-not-shared-by-the-account) is.
- **Behavior under load:** what happens at each limit (refused, and with which error; queued; slowed), how fast the service scales, and its latency. Each way the type will behave differently is an entry of kind Behavior; cite its ID beside the line.
- **Evidence:** every claim marked as an entry's is (Documented with a link, Observed, or Assumption), checked on the profile's date or on a later one given beside it.

The profile records what AWS does; the [defaults table](#default-values-and-their-evidence) records what the model starts with and how sure that is. The pages for the first five types were written before profiles and don't have one yet.

## Differences that matter most for the templates

| ID | Difference | Skew | Template | Status |
|---|---|---|---|---|
| [LMB-8](fidelity/lambda.md#lmb-8-rds-connections-are-held-per-invocation-not-per-environment) | RDS connections are held per invocation, not per execution environment | Optimistic | A | Open |
| [RDS-2](fidelity/rds.md#rds-2-database-capacity-is-a-fixed-pool-of-query-workers) | Database capacity is a fixed pool of workers with a clean plateau | Optimistic | A | Open |
| [RDS-4](fidelity/rds.md#rds-4-opening-a-connection-is-free) | Opening a connection is free | Optimistic | A | Open |
| [SQS-1](fidelity/sqs.md#sqs-1-failed-messages-come-back-immediately) | Failed messages come back immediately, not after the visibility timeout | Mixed | B | Open |
| [SQS-3](fidelity/sqs.md#sqs-3-the-consumer-reaches-full-concurrency-instantly) | The SQS consumer reaches full concurrency instantly | Optimistic | B | Open |
| [DDB-1](fidelity/dynamodb.md#ddb-1-every-request-costs-one-capacity-unit) | Every DynamoDB request costs one capacity unit | Pessimistic for reads | B | Open |
| [DDB-4](fidelity/dynamodb.md#ddb-4-throttled-requests-fail-immediately) | Throttled DynamoDB requests fail immediately; AWS SDKs retry them | Mixed | B | Open |
| [LMB-1](fidelity/lambda.md#lmb-1-concurrency-is-per-function-not-shared-by-the-account) | Lambda concurrency is per function, not shared by the account | Optimistic | B | Open |

---

## The service pages

The entries are on a page per service, with IDs that start the same way:

- [Engine and edges](fidelity/engine-and-edges.md) (ENG)
- [API Gateway](fidelity/api-gateway.md) (APIGW)
- [Lambda](fidelity/lambda.md) (LMB)
- [DynamoDB](fidelity/dynamodb.md) (DDB)
- [RDS](fidelity/rds.md) (RDS)
- [SQS and the Lambda consumer](fidelity/sqs.md) (SQS)
- [S3](fidelity/s3.md) (S3), the first page with a profile

## Default values and their evidence

Each service page ends with a table of its defaults, and the engine page has the edges'. The Details tab quotes these tables: each setting's help ends with its default and how sure it is ("Default 16: an assumption (RDS-2)."). A new edge's settings come from its caller's type (`edgeDefaults`), so the edge rows are by caller. The field descriptors in [`src/application/details/fields/`](../../src/application/details/fields/) carry the level and the entry, and `field-evidence.test.ts` checks them against these tables, so keep each Evidence cell starting with its level and naming its entry, if it has one, by ID. A row's links are checked along with the entries that cite the same pages.

## Keeping this page current

- When a model differs from AWS, add an entry to its service's page in the same change, `Open` and checked today, and mention its ID in the code comment where the model differs. A new service gets a page of its own in [`fidelity/`](fidelity/), listed above and starting with its [profile](#a-services-profile); `fidelity-pages.test.ts` fails for a page that isn't, or for an ID that two entries share.
- When a gap is closed, delete the entry (git history keeps it) and update the code comment.
- Only the maintainer accepts a gap, or decides to keep one open. When they do, change its status to `Accepted:` with their reason, or add a "Kept open:" note with theirs. To challenge either reason, ask the maintainer; don't change the status on your own.
- When you recheck an entry's evidence and links, set its Checked date to that day, and correct what has changed.
- An Assumption becomes Documented only with a link to AWS documentation that states it. Re-check links before quoting them in the app; AWS quotas and behavior change.
- Facts worth teaching can also go in [AWS: Did you know?](../learning/aws-did-you-know.md).
