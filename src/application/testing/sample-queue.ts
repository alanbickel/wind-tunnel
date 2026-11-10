import { lambdaDefinition, sqsDefinition } from "../../domain/components/aws";
import type { Component } from "../../domain/model/project";

/** An SQS queue with its type's default settings, named "Queue". */
export const SAMPLE_QUEUE: Component = {
  id: "queue",
  type: "sqs",
  name: "Queue",
  config: sqsDefinition.defaultConfig,
};

/** A Lambda with its type's default settings, named "Writer": a queue's consumer. */
export const SAMPLE_WRITER: Component = {
  id: "writer",
  type: "lambda",
  name: "Writer",
  config: lambdaDefinition.defaultConfig,
};
