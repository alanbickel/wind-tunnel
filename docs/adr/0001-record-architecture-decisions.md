# ADR-0001: Record architecture decisions

- **Status:** Accepted; amended 2026-10-22
- **Date:** 2026-10-13

## Context

This project is expected to grow well beyond its first version, and to be read and maintained by people who were not present when early decisions were made. Without a record of *why* things are the way they are, maintainers either reverse good decisions by accident or are afraid to change bad ones.

## Decision

We record significant architecture decisions as Architecture Decision Records (ADRs) in `docs/adr/`, using the format introduced by Michael Nygard:

- One decision per file, named `NNNN-short-title.md`, numbered sequentially.
- Sections: **Status**, **Date**, **Context**, **Decision**, **Consequences**.
- Status is one of: `Proposed`, `Accepted`, `Deprecated`, `Superseded by ADR-NNNN`.
- ADRs are immutable once accepted. To change a decision, write a new ADR that supersedes the old one, and update the old one's status line only.

  > **Changed by the [addendum of 2026-10-22](#addendum-2026-10-22).**

A decision is "significant" if it affects the structure of the codebase, introduces or removes a dependency, changes a public data format, or would surprise a new maintainer.

Use [`template.md`](template.md) when writing a new ADR.

## Consequences

- New maintainers can read `docs/adr/` in order to understand how the architecture came to be.
- Writing an ADR adds a small cost to significant changes; that cost is intentional.
- ADRs that are proposed in a pull request are reviewed along with the code they justify.

## Addendum, 2026-10-15

Accepted ADRs may now carry dated addenda. A later change sometimes affects an ADR without changing its decision: an interface it quotes gets a new signature, or a file it names moves. Leaving the ADR as written misleads readers, and editing it loses the record of what was decided at the time.

- An addendum is a section at the end of the ADR headed `## Addendum, YYYY-MM-DD`. It says what changed, why, and how it affects the ADR, with a link to the commit or ADR responsible.
- The body and decision above an addendum are still never edited.
- A changed decision still needs a new ADR that supersedes the old one.

> **Changed by the [addendum of 2026-10-22](#addendum-2026-10-22).**

This addendum is the first.

## Addendum, 2026-10-22

**Context.** [ADR-0015](0015-findings-come-from-registered-detectors.md) records several decisions: how detectors are registered, what limits declare, the shape of a finding, and the verdict. One point of it, where a finding's text is worded, may change ([Roadmap item 10](https://github.com/alanbickel/wind-tunnel/issues/32)). Under the rules above, that needs a new ADR that supersedes ADR-0015, which would mark its other decisions as superseded too, or copy them into the new ADR, away from their date and context.

What immutability protects is the information an ADR recorded: its context, decision, rationale, and consequences, as they stood when it was accepted. A dated marker beside a point doesn't change that information, and it tells a reader the point no longer holds as written.

**Decision.**

- Immutability applies to the recorded information. An accepted ADR's text is never reworded or removed.
- An addendum may change part of an ADR's decision. It's headed `## Addendum, YYYY-MM-DD`, as before, and gives the change its own context, decision, and consequences.
- Each point an addendum changes gets a marker on its own line directly after it, and nothing else above the addenda changes. The marker reads `> **Changed by the [addendum of YYYY-MM-DD](#addendum-yyyy-mm-dd).**`
- An addendum that changes a decision sets the status line to `Accepted; amended YYYY-MM-DD`, and the ADR's row in the [ADR overview](adr-overview.md) states the decision as it now stands. An addendum that only notes a later change, as the first one does, changes neither.
- A new ADR that supersedes the old one is still needed when the ADR's main decision, the one its title states, no longer holds.

**Consequences.**

- An ADR's history stays in one file and in order, and its original text still reads as it did when accepted.
- A reader has to check the status line and follow the markers. An ADR changed by many addenda reads poorly, which is a sign it should be superseded.
- The points above that this addendum changes are marked, as the rule's first use.
