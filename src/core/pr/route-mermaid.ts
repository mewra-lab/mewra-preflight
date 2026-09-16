import type { RouteChip } from "../../shared/types.js";

export function buildRouteSectionMermaid(
  chip: RouteChip,
  allChips: RouteChip[],
  modifiedFiles: string[],
): string {
  const lines = ["graph TD"];
  const short = chip.file.split("/").slice(-2).join("/");
  lines.push(`  SRC[\"${short}\"]`);
  lines.push(`  EP[\"${chip.method} ${chip.route}\"]`);
  lines.push("  EP --> SRC");

  const siblings = allChips.filter(
    (candidate) =>
      candidate.file === chip.file &&
      `${candidate.method} ${candidate.route}` !==
        `${chip.method} ${chip.route}`,
  );
  for (const [index, sibling] of siblings.slice(0, 4).entries()) {
    const id = `SIB_${index}`;
    lines.push(`  ${id}[\"${sibling.method} ${sibling.route}\"]`);
    lines.push(`  ${id} --> SRC`);
  }

  const relatedFiles = modifiedFiles.filter(
    (file) =>
      file !== chip.file &&
      !allChips.some((candidate) => candidate.file === file),
  );
  for (const [index, file] of relatedFiles.slice(0, 4).entries()) {
    const id = `REL_${index}`;
    lines.push(`  ${id}[\"${file.split("/").slice(-2).join("/")}\"]`);
    lines.push(`  SRC --> ${id}`);
  }
  return lines.join("\n");
}
