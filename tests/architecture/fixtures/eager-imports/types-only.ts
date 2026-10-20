import ts from "typescript";

export interface TypesOnly {
  readonly version: string;
}

export const typesOnlyVersion = ts.version;
