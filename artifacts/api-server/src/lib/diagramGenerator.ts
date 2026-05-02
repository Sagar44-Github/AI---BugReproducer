import type { DiagramOutput } from "./agentSchemas";

/**
 * Converts a structured DiagramOutput into valid Mermaid flowchart syntax.
 *
 * This is the single source of truth for diagram rendering — the LLM outputs
 * a validated schema, this function converts it deterministically so every
 * bug produces a structurally unique diagram.
 */
export function generateMermaidFromDiagram(diagram: DiagramOutput): string {
  const lines: string[] = ["flowchart TD"];

  // Sanitise IDs — strip anything Mermaid doesn't allow, prefix reserved words
  const safeId = (id: string): string => {
    const clean = id.replace(/[^a-zA-Z0-9_]/g, "_");
    // "end" is a Mermaid reserved keyword — prefix it
    return clean.toLowerCase() === "end" ? `_${clean}` : clean;
  };

  // Sanitise label text — escape double-quotes and cap length
  const safeLabel = (text: string, maxLen = 50): string =>
    text.replace(/"/g, "#quot;").replace(/\n/g, " ").slice(0, maxLen);

  // ─── Node definitions ────────────────────────────────────────────────────────
  lines.push("");

  for (const node of diagram.nodes) {
    const id = safeId(node.id);
    const label = safeLabel(node.label);
    const sc = node.stateChange
      ? `<br/><small>${safeLabel(node.stateChange, 60)}</small>`
      : "";

    switch (node.type) {
      case "start":
        // Stadium shape — entry point
        lines.push(`  ${id}(["▶ ${label}"])`);
        break;

      case "step":
        // Rectangle with optional inline state note
        if (node.stateChange) {
          lines.push(`  ${id}["${label}${sc}"]`);
        } else {
          lines.push(`  ${id}["${label}"]`);
        }
        break;

      case "failure":
        // Rectangle with failure styling
        lines.push(`  ${id}["💥 ${label}"]:::failure`);
        break;

      case "end":
        // Rounded rectangle — terminal state
        lines.push(`  ${id}(["${label}"])`);
        break;

      case "eliminated":
        // Rectangle with eliminated styling — dead end branch
        lines.push(`  ${id}["${label}"]:::eliminated`);
        break;
    }
  }

  // ─── Edge definitions ────────────────────────────────────────────────────────
  lines.push("");

  for (const edge of diagram.edges) {
    const from = safeId(edge.from);
    const to = safeId(edge.to);
    const label = edge.label ? safeLabel(edge.label, 40) : "";

    if (edge.isAlternate) {
      // Dashed arrow — eliminated hypothesis path
      lines.push(
        label
          ? `  ${from} -. "${label}" .-> ${to}`
          : `  ${from} -.-> ${to}`
      );
    } else {
      // Solid arrow — primary execution path
      lines.push(
        label
          ? `  ${from} -->|"${label}"| ${to}`
          : `  ${from} --> ${to}`
      );
    }
  }

  // ─── Style classes ───────────────────────────────────────────────────────────
  lines.push("");
  lines.push(
    "  classDef failure fill:#dc2626,stroke:#ef4444,color:#fff,font-weight:bold"
  );
  lines.push(
    "  classDef eliminated fill:#1c1c1e,stroke:#3f3f46,color:#71717a,font-style:italic"
  );

  return lines.join("\n");
}
