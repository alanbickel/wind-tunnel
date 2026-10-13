# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

This project is expected to grow well beyond its first version, and to be read and maintained by people who were not present when early decisions were made. Without a record of *why* things are the way they are, maintainers either reverse good decisions by accident or are afraid to change bad ones.

## Decision

We record significant architecture decisions as Architecture Decision Records (ADRs) in `docs/adr/`, using the format introduced by Michael Nygard:

- One decision per file, named `NNNN-short-title.md`, numbered sequentially.
- Sections: **Status**, **Date**, **Context**, **Decision**, **Consequences**.
- Status is one of: `Proposed`, `Accepted`, `Deprecated`, `Superseded by ADR-NNNN`.
- ADRs are immutable once accepted. To change a decision, write a new ADR that supersedes the old one, and update the old one's status line only.

A decision is "significant" if it affects the structure of the codebase, introduces or removes a dependency, changes a public data format, or would surprise a new maintainer.

Use [`template.md`](template.md) when writing a new ADR.

## Consequences

- New maintainers can read `docs/adr/` in order to understand how the architecture came to be.
- Writing an ADR adds a small cost to significant changes; that cost is intentional.
- ADRs that are proposed in a pull request are reviewed along with the code they justify.
