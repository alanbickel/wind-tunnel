import { describe, expect, it } from "vitest";
import { dynamoDbDefinition } from "../../domain/components/aws";
import type { Component } from "../../domain/model/project";
import type { ProjectRecord } from "../ports/project-record";
import { sampleRecord } from "../testing/sample-record";
import {
  renameComponent,
  resetComponentSetting,
  setComponentSetting,
} from "./component-edits";

/** The sample's component with `id`, in `record`. */
function componentIn(record: ProjectRecord, id: string): Component {
  const component = record.project.architecture.components.find(
    (c) => c.id === id,
  );
  if (component === undefined) throw new Error(`no component "${id}"`);
  return component;
}

/** A deep copy, to check later that a command left its input alone. */
function copyOf(record: ProjectRecord): ProjectRecord {
  return JSON.parse(JSON.stringify(record)) as ProjectRecord;
}

describe("component edit commands", () => {
  // Fails if setComponentSetting changes the record it's given, drops the
  // component's other settings, or touches another component.
  it("sets one setting, and leaves the input unchanged", () => {
    const before = copyOf(sampleRecord);

    const next = setComponentSetting(sampleRecord, {
      componentId: "table",
      key: "burstSec",
      value: 60,
    });

    expect(componentIn(next, "table").config).toEqual({
      ...dynamoDbDefinition.defaultConfig,
      burstSec: 60,
    });
    expect(componentIn(next, "fn")).toBe(componentIn(sampleRecord, "fn"));
    expect(sampleRecord).toEqual(before);
  });

  // Fails if renameComponent changes the id (steps and edges would lose
  // it), the config, or the input record.
  it("renames a component, and nothing else", () => {
    const before = copyOf(sampleRecord);

    const next = renameComponent(sampleRecord, {
      componentId: "table",
      name: "orders",
    });

    expect(componentIn(next, "table")).toEqual({
      ...componentIn(sampleRecord, "table"),
      name: "orders",
    });
    expect(next.project.workflows).toBe(sampleRecord.project.workflows);
    expect(next.project.architecture.edges).toBe(
      sampleRecord.project.architecture.edges,
    );
    expect(sampleRecord).toEqual(before);
  });

  // Fails if reset takes a value other than the type's defaultConfig's,
  // or changes its input.
  it("resets a setting to its type's default", () => {
    const changed = setComponentSetting(sampleRecord, {
      componentId: "table",
      key: "latency",
      value: { kind: "constant", valueMs: 3 },
    });
    const before = copyOf(changed);

    const next = resetComponentSetting(changed, {
      componentId: "table",
      key: "latency",
      defaultConfig: dynamoDbDefinition.defaultConfig,
    });

    expect(componentIn(next, "table").config["latency"]).toEqual(
      dynamoDbDefinition.defaultConfig.latency,
    );
    expect(changed).toEqual(before);
  });

  // Fails if a command for a missing component or default throws or
  // makes a new record, which would save a change that changed nothing.
  it("returns the record itself when there's nothing to change", () => {
    expect(
      setComponentSetting(sampleRecord, {
        componentId: "gone",
        key: "burstSec",
        value: 1,
      }),
    ).toBe(sampleRecord);
    expect(
      resetComponentSetting(sampleRecord, {
        componentId: "table",
        key: "nothing",
        defaultConfig: dynamoDbDefinition.defaultConfig,
      }),
    ).toBe(sampleRecord);
  });
});
