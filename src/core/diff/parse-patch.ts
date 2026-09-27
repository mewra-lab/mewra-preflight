// MARK: - Types

export type AddedDiffLine = {
  file: string;
  line: number;
  content: string;
};

// MARK: - Parser

export function decodeGitPath(value: string): string {
  if (!value.startsWith('"')) return value;
  const bytes: Buffer[] = [];
  const input = value.slice(1, -1);
  const escapes: Record<string, string> = {
    a: "\x07",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
    v: "\v",
    '"': '"',
    "\\": "\\",
  };
  for (let i = 0; i < input.length;) {
    if (input[i] !== "\\") {
      const end = input.indexOf("\\", i);
      const next = end < 0 ? input.length : end;
      bytes.push(Buffer.from(input.slice(i, next)));
      i = next;
    } else {
      const octal = /^[0-7]{1,3}/.exec(input.slice(i + 1));
      if (octal) {
        bytes.push(Buffer.from([parseInt(octal[0], 8)]));
        i += octal[0].length + 1;
      } else {
        bytes.push(
          Buffer.from(escapes[input[i + 1] ?? ""] ?? input[i + 1] ?? ""),
        );
        i += 2;
      }
    }
  }
  return Buffer.concat(bytes).toString("utf8");
}

export function patchDestination(section: string): string | undefined {
  const destination = /^\+\+\+ (.+)$/m.exec(section)?.[1];
  if (destination && destination !== "/dev/null") {
    const path = destination.startsWith('"')
      ? decodeGitPath(destination)
      : destination.split("\t")[0]!;
    return path.replace(/^b\//, "");
  }
  const renamed = /^rename to (.+)$/m.exec(section)?.[1];
  if (renamed) return decodeGitPath(renamed);
  const header =
    /^diff --git (?:"(?:[^"\\]|\\.)*"|.*?) ("(?:[^"\\]|\\.)*"|b\/.*)$/m.exec(
      section,
    )?.[1];
  return header ? decodeGitPath(header).replace(/^b\//, "") : undefined;
}

export function parseAddedLines(
  rawPatch: string,
  fallbackFile = "(diff)",
): AddedDiffLine[] {
  const lines = rawPatch.split("\n");
  const result: AddedDiffLine[] = [];
  let currentFile = fallbackFile;
  let currentLine = 1;
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      inHunk = false;
      continue;
    }
    if (!inHunk && line.startsWith("+++ ")) {
      currentFile = patchDestination(line) ?? currentFile;
      continue;
    }

    if (line.startsWith("@@ ")) {
      const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match && match[1]) {
        currentLine = parseInt(match[1], 10);
        inHunk = true;
      }
      continue;
    }

    if (!inHunk && (line.startsWith("+++") || line.startsWith("---"))) {
      continue;
    }

    if (line.startsWith("+")) {
      result.push({
        file: currentFile,
        line: currentLine,
        content: line.slice(1),
      });
      currentLine++;
    } else if (line.startsWith(" ")) {
      currentLine++;
    }
  }

  return result;
}
