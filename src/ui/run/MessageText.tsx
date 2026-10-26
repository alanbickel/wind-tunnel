import type {
  Message,
  MessagePart,
} from "../../application/run-analysis/findings/message";
import { partText } from "../../application/run-analysis/findings/message-format";
import type { ComponentNames } from "../../application/run-analysis/component-names";
import styles from "./MessageText.module.css";

/**
 * The parts set apart from the words around them, by kind. Item 11 of the
 * roadmap turns them into links to the diagram and charts.
 */
const SET_APART: Readonly<Record<MessagePart["kind"], string | undefined>> = {
  text: undefined,
  number: undefined,
  component: styles.component,
  time: styles.time,
};

export interface MessageTextProps {
  readonly message: Message;
  /** Names the components in it. */
  readonly nameOf: ComponentNames;
}

/**
 * A finding's or the verdict's sentence, worded as the CLI words it
 * (`partText`), with components, by name, and times set apart.
 */
export function MessageText({ message, nameOf }: MessageTextProps) {
  // A message never reorders, so a part's index is its identity.
  return message.map((part, i) => <Part key={i} part={part} nameOf={nameOf} />);
}

interface PartProps {
  readonly part: MessagePart;
  readonly nameOf: ComponentNames;
}

function Part({ part, nameOf }: PartProps) {
  const className = SET_APART[part.kind];
  const text = partText(part, nameOf);
  if (className === undefined) return text;
  return <span className={className}>{text}</span>;
}
