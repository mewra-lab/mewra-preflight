// MARK: - Types

export type AddedDiffLine = {
  file: string;
  line: number;
  content: string;
};

// MARK: - Parser

export function parseAddedLines(
  rawPatch: string,
  fallbackFile = "(diff)",
): AddedDiffLine[] {
  const lines = rawPatch.split("\n");
  const result: AddedDiffLine[] = [];
  let currentFile = fallbackFile;
  let currentLine = 1;

  for (const line of lines) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("@@ ")) {
      const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match && match[1]) {
        currentLine = parseInt(match[1], 10);
      }
      continue;
    }

    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }

    if (line.startsWith("+")) {
      result.push({
        file: currentFile,
        line: currentLine,
        content: line.slice(1),
      });
      currentLine++;
    } else if (!line.startsWith("-")) {
      currentLine++;
    }
  }

  return result;
}
