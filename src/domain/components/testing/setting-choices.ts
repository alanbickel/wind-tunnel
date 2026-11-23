import { z } from "zod";

/**
 * The values the setting `key` of an object schema allows, if it's an enum,
 * with or without a default; undefined for any other setting, or a schema
 * that isn't an object. For tests that check a choice descriptor's options
 * against a config or request settings schema, which stays the authority.
 */
export function settingChoices(
  schema: unknown,
  key: string,
): readonly string[] | undefined {
  if (!(schema instanceof z.ZodObject)) return undefined;
  const setting: unknown = schema.shape[key];
  const inner = setting instanceof z.ZodDefault ? setting.unwrap() : setting;
  if (!(inner instanceof z.ZodEnum)) return undefined;
  return inner.options.map(String);
}
