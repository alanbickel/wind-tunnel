# Fidelity: A Service's Profile

A new component type starts with its service's profile ([Adding a component type](../../../CONTRIBUTING.md#adding-a-component-type)): what AWS exposes and enforces, researched before any code, so the type's settings, defaults, and limits come from AWS rather than from what was easy to build. This page says what a profile holds. How to read the entries a profile cites, and the list of every type's pages, are on the [fidelity index](../fidelity.md).

## Where it goes

Each component type has a folder in [`fidelity/`](./), named for its type (`lambda`, `s3`), with two pages: its profile, `<type>-profile.md`, and its [fidelity entries](../fidelity.md#how-to-read-an-entry), `<type>-fidelity.md`. A new type's folder starts with its profile, listed on the [index](../fidelity.md#the-service-pages). The profile is a research checklist, a row or a line per item, not prose, with a `Checked:` date for the whole profile. [S3's](s3/s3-profile.md) is the first.

The first five types were built before profiles: their profile pages hold only their defaults tables and rejection reasons, with a line saying the profile hasn't been researched yet.

## What every profile has

These sections, in this order:

- **The model, in one line:** what one component stands for (a function, a table, one prefix of a bucket) and what it does with a request.
- **Model choices:** each place where AWS leaves the model room to choose, such as behavior AWS doesn't put numbers on, with the choice and why; cite the entry it leaves open. Leave it out if there are none.
- **Actions:** each Wind Tunnel action the type accepts (`read`, `write`, …), the service's requests it stands for, and the limit each counts against.
- **Settings:** each setting AWS exposes that could change behavior under load, with AWS's default, its allowed range, and whether Wind Tunnel models it. One the type doesn't model is an entry of kind Setting, Open or Accepted with its reason; cite its ID in place of "yes".
- **Default values and their evidence:** right under Settings, the type's [defaults table](#default-values-and-their-evidence).
- **Quotas:** each limit, with its default, whether it can be raised, and its scope: per resource, per account and Region, or per something smaller, such as a partition or a prefix. One the type doesn't enforce, or enforces at another scope, is an entry of kind Behavior, as [LMB-1](lambda/lambda-fidelity.md#lmb-1-concurrency-is-per-function-not-shared-by-the-account) is.
- **Behavior under load:** what happens at each limit (refused, and with which error; queued; slowed), how fast the service scales, and its latency. Each way the type will behave differently is an entry of kind Behavior; cite its ID beside the line.
- **Rejection reasons:** each reason the type rejects with, its [error kind](../../glossary.md#error-kind), and the evidence for the kind: the error AWS answers with, and how the SDKs class it.
- **Evidence:** every claim marked as an entry's is (Documented with a link, Observed, or Assumption), checked on the profile's date or on a later one given beside it.

The profile records what AWS does; its defaults table records what the model starts with and how sure that is.

## Sections by shape

A type may need more than these, depending on its shape: a rate-limited service, compute, a pool of workers or connections, a queue. Don't add a section ahead of need. The first type of a shape that needs one adds it to its profile, and lists it here under its shape, so the next type of that shape has it too. None is listed yet: S3, the first rate-limited type, needed only the sections above.

## Default values and their evidence

Each type's profile has a table of its defaults (the numbers in its definition's `defaultConfig`), under Settings. The [engine and edges page](engine-and-edges.md#default-values-and-their-evidence) has the edges'. The Details tab quotes these tables: each setting's help ends with its default and how sure it is ("Default 16: an assumption (RDS-2)."). A new edge's settings come from its caller's type (`edgeDefaults`), so the edge rows are by caller. The field descriptors in [`src/application/details/fields/`](../../../src/application/details/fields/) carry the level and the entry, and `field-evidence.test.ts` checks them against these tables, so keep each Evidence cell starting with its level and naming its entry, if it has one, by ID. A row's links are checked along with the entries that cite the same pages.
