// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createPhrasebook } from "../../application/run-analysis/findings/create-phrasebook";
import type {
  Finding,
  Fix,
} from "../../application/run-analysis/findings/finding";
import {
  component,
  count,
  say,
} from "../../application/run-analysis/findings/message";
import { orderFindings } from "../../application/run-analysis/findings/order-findings";
import { verdictOf } from "../../application/run-analysis/findings/verdict";
import {
  SAID_PHRASES,
  said,
  sampleFinding,
  sampleKey,
  sampleRun,
} from "../../application/testing/sample-findings";
import { awsNameComponents } from "../../application/testing/aws-name-components";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import { Findings } from "./Findings";

// `sampleRecord`'s names differ from its IDs: `fn` is "Function".
const wording = {
  phrasebook: createPhrasebook({
    project: sampleRecord.project,
    detectors: [{ id: "said", detect: () => [], phrases: SAID_PHRASES }],
  }),
  nameOf: awsNameComponents().execute({ project: sampleRecord.project }),
};

/** One second of `sampleRecord`'s 5 s workload, so the run reads "so far". */
const oneSecond = [
  sampleSnapshot({ second: 1, read: { started: 4, succeeded: 4 } }),
];

function fix(overrides: Partial<Fix>): Fix {
  return {
    scope: "aws",
    message: say`Do it.`,
    claim: { kind: "assumption" },
    fidelityIds: [],
    ...overrides,
  };
}

/** A failure at fn, with its cause's start, reasons, fixes, and Learn more. */
const failure = sampleFinding({
  key: sampleKey("failed"),
  severity: "failure",
  causeWindow: { fromMs: 14_000, toMs: 15_000 },
  summary: said(say`${count(1_234)} requests failed at ${component("fn")}.`),
  reasons: [said(say`fn ran out.`)],
  fixes: [
    fix({
      claim: {
        kind: "documented",
        title: "Lambda scaling",
        url: "https://example.com/scaling",
      },
      fidelityIds: ["LAMBDA-1"],
    }),
    fix({
      scope: "wind-tunnel",
      claim: { kind: "observed", file: "src/x.test.ts", test: "shows it" },
    }),
    fix({ message: say`Raise ${component("fn")}'s limit.` }),
  ],
  learnMore: "lambda-scales",
  causedBy: [sampleKey("cause")],
});

/** A note that explains the failure. */
const cause = sampleFinding({
  key: sampleKey("cause"),
  summary: said(say`Requests waited.`),
});

function renderFindings(findings: readonly Finding[]) {
  const run = sampleRun(oneSecond);
  render(
    <Findings
      findings={{
        verdict: verdictOf(run, findings),
        findings: orderFindings(findings),
      }}
      wording={wording}
    />,
  );
}

function summaryOf(number: string): string | null {
  const button = screen.getByRole("button", {
    name: `About finding ${number}`,
  });
  return button.closest("li")?.querySelector("p")?.textContent ?? null;
}

describe("Findings", () => {
  afterEach(cleanup);

  // Fails if the severity shows only by color, the numbering stops
  // matching the CLI's, a cause isn't nested in the finding it explains, a
  // finding's control isn't described by its summary, or a component shows
  // by its ID ("fn") rather than its name ("Function").
  it("labels each finding's severity in words, with its causes beneath it", () => {
    renderFindings([failure, cause]);
    const description = "1. Failure: 1,234 requests failed at Function.";

    expect(
      screen.getByRole("button", { name: "About finding 1", description }),
    ).toBeTruthy();

    expect(summaryOf("1")).toBe(
      "1. Failure: 1,234 requests failed at Function.",
    );
    expect(summaryOf("1.1")).toBe("1.1. Note: Requests waited.");
    const item = screen
      .getByRole("button", { name: "About finding 1" })
      .closest("li");
    const causeItem = screen
      .getByRole("button", { name: "About finding 1.1" })
      .closest("li");
    expect(causeItem !== null && item?.contains(causeItem)).toBe(true);
  });

  // Fails if a component or a time stops being set apart from the words
  // around it.
  it("sets components and times apart from the text", () => {
    renderFindings([failure]);

    const [fn] = screen.getAllByText("Function", { selector: "span" });
    const time = screen.getByText("14 s", { selector: "span" });
    expect(fn?.closest("p")?.textContent).toBe(
      "1. Failure: 1,234 requests failed at Function.",
    );
    expect(time.closest("p")?.textContent).toBe("Cause began at 14 s.");
  });

  // Fails if the control stops being a native button (which is what makes
  // Enter and Space press it, and Tab reach it; jsdom doesn't synthesize the
  // key's click), pressing it doesn't open the details, or Escape doesn't
  // close them and hand focus back.
  it("opens a finding's details from its control, and closes them on Escape", () => {
    renderFindings([failure]);
    const control = screen.getByRole("button", { name: "About finding 1" });
    const reason = screen.getByText("fn ran out.");
    expect(control.tagName).toBe("BUTTON");
    expect(control.tabIndex).toBe(0);
    expect(reason.closest("[hidden]")).not.toBeNull();

    fireEvent.click(control);
    expect(reason.closest("[hidden]")).toBeNull();
    fireEvent.keyDown(reason, { key: "Escape" });

    expect(reason.closest("[hidden]")).not.toBeNull();
    expect(document.activeElement).toBe(control);
  });

  // Fails if a fix loses its scope or its claim (a Documented link, an
  // Observed test, or the Assumption label), or names a component by its ID
  // ("fn") rather than its name ("Function").
  it("shows each fix with its claim, and links Learn more", () => {
    renderFindings([failure]);
    fireEvent.click(screen.getByRole("button", { name: "About finding 1" }));
    const docs = screen.getByRole("link", { name: "Lambda scaling" });
    const test = screen.getByRole("link", { name: "src/x.test.ts" });
    const fixes = docs.closest("ul")?.querySelectorAll("li") ?? [];

    expect([...fixes].map((li) => li.textContent)).toEqual([
      "In AWS: Do it. (Documented: Lambda scaling; fidelity LAMBDA-1)",
      "In Wind Tunnel: Do it. (Observed: src/x.test.ts, “shows it”)",
      "In AWS: Raise Function's limit. (Assumption)",
    ]);
    expect(docs.getAttribute("href")).toBe("https://example.com/scaling");
    expect(test.getAttribute("href")).toMatch(
      /\/blob\/main\/src\/x\.test\.ts$/,
    );
    expect(
      screen.getByRole("link", { name: /^Learn more/ }).getAttribute("href"),
    ).toMatch(/\/docs\/learning\/aws-did-you-know\.md#lambda-scales$/);
  });

  // Fails if a run with nothing to report shows no verdict, or an empty
  // list instead of saying there are none.
  it("gives a healthy run its verdict, and says there are no findings", () => {
    renderFindings([]);

    const region = screen.getByRole("region", { name: "Healthy so far" });
    expect(region.textContent).toContain("All 4 answered requests succeeded.");
    expect(screen.getByText("None.")).toBeTruthy();
  });
});
