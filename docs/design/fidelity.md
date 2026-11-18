# Fidelity: Where Wind Tunnel Differs From AWS

Wind Tunnel simplifies AWS on purpose: a small model that shows the right failure modes is more useful early on than a large one that's hard to reason about. But every simplification shifts the results, and some can change a template's lesson. This page lists each known difference, what AWS actually does, how sure we are, and which way it skews the results, so we can decide what to improve as the project matures.

For the model itself, see the [MVP design](mvp-design.md) and the [component definitions guide](../architecture/component-definitions.md). Work to close a gap is tracked as a GitHub issue; these pages hold the detail.

## How to read an entry

Each entry has an ID (e.g. `LMB-2`) so code comments, commits, and issues can refer to it.

- **Wind Tunnel:** what the model does today.
- **AWS:** what the real service does.
- **Evidence:** how we know what AWS does.
  - **Documented:** stated in AWS documentation. The link is included, and it was checked on the date at the bottom of its page.
  - **Observed:** AWS doesn't publish it; the value comes from measurements by others. Treat it as approximate.
  - **Assumption:** our belief about AWS, not yet verified. Upgrade it when someone finds a source, or correct it.
- **Skew:** which way the difference moves results.
  - **Optimistic:** the model looks healthier than AWS would.
  - **Pessimistic:** the model looks worse than AWS would.
  - **Mixed:** depends on the scenario.
  - **Minor:** unlikely to change a lesson at MVP scale.
- **To close:** what it would take to model it.

Model defaults (the numbers in each definition's `defaultConfig`) are covered in [Default values and their evidence](#default-values-and-their-evidence).

## Differences that matter most for the templates

| ID | Difference | Skew | Template |
|---|---|---|---|
| [LMB-8](fidelity/lambda.md#lmb-8-rds-connections-are-held-per-invocation-not-per-environment) | RDS connections are held per invocation, not per execution environment | Optimistic | A |
| [RDS-2](fidelity/rds.md#rds-2-database-capacity-is-a-fixed-pool-of-query-workers) | Database capacity is a fixed pool of workers with a clean plateau | Optimistic | A |
| [RDS-4](fidelity/rds.md#rds-4-opening-a-connection-is-free) | Opening a connection is free | Optimistic | A |
| [SQS-1](fidelity/sqs.md#sqs-1-failed-messages-come-back-immediately) | Failed messages come back immediately, not after the visibility timeout | Mixed | B |
| [SQS-3](fidelity/sqs.md#sqs-3-the-consumer-reaches-full-concurrency-instantly) | The SQS consumer reaches full concurrency instantly | Optimistic | B |
| [DDB-1](fidelity/dynamodb.md#ddb-1-every-request-costs-one-capacity-unit) | Every DynamoDB request costs one capacity unit | Pessimistic for reads | B |
| [DDB-4](fidelity/dynamodb.md#ddb-4-throttled-requests-fail-immediately) | Throttled DynamoDB requests fail immediately; AWS SDKs retry them | Mixed | B |
| [LMB-1](fidelity/lambda.md#lmb-1-concurrency-is-per-function-not-shared-by-the-account) | Lambda concurrency is per function, not shared by the account | Optimistic | B |

---

## The service pages

The entries are on a page per service, with IDs that start the same way:

- [Engine and edges](fidelity/engine-and-edges.md) (ENG)
- [API Gateway](fidelity/api-gateway.md) (APIGW)
- [Lambda](fidelity/lambda.md) (LMB)
- [DynamoDB](fidelity/dynamodb.md) (DDB)
- [RDS](fidelity/rds.md) (RDS)
- [SQS and the Lambda consumer](fidelity/sqs.md) (SQS)

## Default values and their evidence

Each service page ends with a table of its defaults, and the engine page has the edges'. The Details tab quotes these tables: each setting's help ends with its default and how sure it is ("Default 16: an assumption (RDS-2)."). A new edge's settings come from its caller's type (`edgeDefaults`), so the edge rows are by caller. The field descriptors in [`src/application/details/fields/`](../../src/application/details/fields/) carry the level and the entry, and `field-evidence.test.ts` checks them against these tables, so keep each Evidence cell starting with its level and naming its entry, if it has one, by ID.

## Keeping this page current

- When a model simplifies AWS behavior, add an entry to its service's page in the same change, and mention its ID in the code comment that makes the simplification. A new service gets a page of its own in [`fidelity/`](fidelity/), listed above; `fidelity-pages.test.ts` fails for a page that isn't, or for an ID that two entries share.
- When a gap is closed, delete the entry (git history keeps it) and update the code comment.
- An Assumption becomes Documented only with a link to AWS documentation that states it. Re-check links before quoting them in the app; AWS quotas and behavior change.
- Facts worth teaching can also go in [AWS: Did you know?](../learning/aws-did-you-know.md).
