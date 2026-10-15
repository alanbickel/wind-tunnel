// Finds constructor dependencies typed as classes (ADR-0009). A class's
// collaborators arrive in a type named `<Class>Dependencies`; each of its
// properties must be typed as an interface, so a test can pass in a fake.
import ts from "typescript";

/** One `*Dependencies` property whose type is a class. */
export interface ClassTypedDependency {
  /** Where it was found, as `file: Type.property`. */
  readonly location: string;
  /** The class names the property's type resolves to. */
  readonly classNames: string[];
}

/** The program to search, and which of its files count. */
export interface FindClassTypedDependenciesInput {
  readonly program: ts.Program;
  /** Keeps a file in the search; tests and library files are usually left out. */
  readonly includes: (fileName: string) => boolean;
}

type DependenciesDeclaration =
  ts.InterfaceDeclaration | ts.TypeAliasDeclaration;

interface DeclarationInFile {
  readonly declaration: DependenciesDeclaration;
  readonly fileName: string;
}

const DEPENDENCIES_SUFFIX = "Dependencies";

/** Builds a program from a tsconfig file, the way `tsc -p` would. */
export function programFromConfig(configPath: string): ts.Program {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        );
      },
    },
  );
  if (parsed === undefined) throw new Error(`Can't read ${configPath}`);
  return ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
}

/** Every `*Dependencies` property in the included files that is typed as a class. */
export function findClassTypedDependencies({
  program,
  includes,
}: FindClassTypedDependenciesInput): ClassTypedDependency[] {
  const checker = program.getTypeChecker();
  return program
    .getSourceFiles()
    .filter((file) => includes(file.fileName))
    .flatMap(dependenciesDeclarations)
    .flatMap((found) => classTypedProperties(found, checker));
}

function dependenciesDeclarations(file: ts.SourceFile): DeclarationInFile[] {
  return file.statements
    .filter(isDependenciesDeclaration)
    .map((declaration) => ({ declaration, fileName: file.fileName }));
}

function isDependenciesDeclaration(
  statement: ts.Statement,
): statement is DependenciesDeclaration {
  const named =
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement);
  return named && statement.name.text.endsWith(DEPENDENCIES_SUFFIX);
}

function classTypedProperties(
  { declaration, fileName }: DeclarationInFile,
  checker: ts.TypeChecker,
): ClassTypedDependency[] {
  const type = checker.getTypeAtLocation(declaration.name);
  return checker
    .getPropertiesOfType(type)
    .map((property) => ({
      location: `${fileName}: ${declaration.name.text}.${property.name}`,
      classNames: classNamesIn(checker.getTypeOfSymbol(property)),
    }))
    .filter(({ classNames }) => classNames.length > 0);
}

/** The classes a type refers to, looking inside unions (`Foo | undefined`). */
function classNamesIn(type: ts.Type): string[] {
  const members = type.isUnion() ? type.types : [type];
  return members
    .map((member) => member.getSymbol())
    .filter((symbol) => symbol !== undefined && isClass(symbol))
    .map((symbol) => symbol?.name ?? "");
}

function isClass(symbol: ts.Symbol): boolean {
  return (symbol.flags & ts.SymbolFlags.Class) !== 0;
}
