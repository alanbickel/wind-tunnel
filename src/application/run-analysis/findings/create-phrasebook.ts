import type { Project } from "../../../domain/model/project";
import { lookup } from "../../../domain/shared/kind-handlers";
import { createFindingsCatalog } from "./catalog/create-findings-catalog";
import {
  typeOf,
  type FindingsCatalog,
  type TypeWording,
} from "./catalog/type-advice";
import type { Detector } from "./detector";
import type { Length, Phrase, PhraseTable, Statement } from "./phrase";
import type { Phrasebook } from "./phrasebook";
import { VERDICT_PHRASES } from "./verdict-phrases";
import type { ComponentWordInput, Vocabulary } from "./vocabulary";

/** The project whose findings are worded, and what words them. */
export interface CreatePhrasebookInput {
  readonly project: Project;
  /** Each registers the phrases for the statements it returns. */
  readonly detectors: readonly Detector[];
  /** The words each component type registers for its own IDs. */
  readonly catalog?: FindingsCatalog;
}

/**
 * The phrasebook for the detectors' statements and the verdict's. Two
 * detectors may register one kind only with the same phrase, as
 * failed-requests and failed-deliveries do for limit-refused's.
 */
export function createPhrasebook(input: CreatePhrasebookInput): Phrasebook {
  const { project, detectors, catalog = createFindingsCatalog() } = input;
  const phrases = phrasesOf([
    VERDICT_PHRASES,
    ...detectors.map((d) => d.phrases),
  ]);
  const vocabularies: Readonly<Record<Length, Vocabulary>> = {
    long: vocabularyOf({ project, catalog, length: "long" }),
    short: vocabularyOf({ project, catalog, length: "short" }),
  };
  return {
    word: (statement, length) => {
      const phrase = phrases.get(statement.kind);
      if (phrase === undefined) {
        throw new Error(`No phrase is registered for "${statement.kind}"`);
      }
      return phrase[length](statement, lookup(vocabularies, length));
    },
  };
}

/** Every table's phrases by kind; throws if two differ for one kind. */
function phrasesOf(
  tables: readonly PhraseTable[],
): Map<string, Phrase<Statement>> {
  const phrases = new Map<string, Phrase<Statement>>();
  for (const [kind, phrase] of tables.flatMap((t) => Object.entries(t))) {
    const registered = phrases.get(kind);
    if (registered !== undefined && registered !== phrase) {
      throw new Error(`Two different phrases are registered for "${kind}"`);
    }
    phrases.set(kind, phrase);
  }
  return phrases;
}

/** What the vocabulary looks words up in, and at which length. */
interface VocabularyInput {
  readonly project: Project;
  readonly catalog: FindingsCatalog;
  readonly length: Length;
}

function vocabularyOf(input: VocabularyInput): Vocabulary {
  const names = new Map(input.project.workflows.map((w) => [w.id, w.name]));
  return {
    reason: (word) => typeWord(input, { word, entries: (w) => w.reasons }),
    limit: (word) => typeWord(input, { word, entries: (w) => w.limits }),
    workflow: (id) => names.get(id) ?? id,
  };
}

/** Which of a type's IDs to word. */
interface TypeWordInput {
  readonly word: ComponentWordInput;
  readonly entries: (wording: TypeWording) => TypeWording["reasons"];
}

/** The type's words for the ID at the length, or the ID itself. */
function typeWord(
  { project, catalog, length }: VocabularyInput,
  { word, entries }: TypeWordInput,
): string {
  const wording = catalog.get(typeOf(project, word.componentId))?.wording;
  if (wording === undefined) return word.id;
  const found = entries(wording);
  if (!Object.hasOwn(found, word.id)) return word.id;
  return found[word.id]?.[length] ?? word.id;
}
