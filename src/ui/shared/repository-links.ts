/** Where the repository's files are read on the web, on `main`. */
const REPOSITORY_FILES_URL =
  "https://github.com/alanbickel/wind-tunnel/blob/main";

/**
 * A link to a file in the repository, from its root, e.g.
 * `docs/learning/aws-did-you-know.md`, and optionally to an anchor in it.
 */
export function repositoryFileUrl(path: string, anchor?: string): string {
  const fragment = anchor === undefined ? "" : `#${anchor}`;
  return `${REPOSITORY_FILES_URL}/${path}${fragment}`;
}
