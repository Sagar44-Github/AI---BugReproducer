import { useEffect, useRef, useState } from "react";

/**
 * Call this as early as possible (e.g. on component mount) to start warming
 * the Mermaid module so it is ready before the user clicks the Flow tab.
 */
export function preloadMermaid(): void {
  void import("mermaid");
}

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

let mermaidInitialized = false;

export function MermaidDiagram({ chart, className }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current || !chart.trim()) return;

    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;

        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: "dark",
            flowchart: {
              curve: "basis",
              htmlLabels: true,
              nodeSpacing: 50,
              rankSpacing: 60,
            },
            themeVariables: {
              background: "#09090b",
              primaryColor: "#18181b",
              primaryTextColor: "#e4e4e7",
              primaryBorderColor: "#3f3f46",
              lineColor: "#52525b",
              secondaryColor: "#1c1c1e",
              tertiaryColor: "#09090b",
              edgeLabelBackground: "#09090b",
              clusterBkg: "#18181b",
              clusterBorder: "#3f3f46",
              titleColor: "#e4e4e7",
            },
          });
          mermaidInitialized = true;
        }

        const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          // Make SVG responsive
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            svgEl.removeAttribute("height");
            svgEl.style.maxWidth = "100%";
            svgEl.style.height = "auto";
          }
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Diagram render failed");
          setLoading(false);
        }
      }
    }

    setLoading(true);
    void render();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-amber-400 font-mono opacity-80">
          ⚠ Diagram render failed — showing Mermaid source
        </p>
        <div className="bg-[#09090b] rounded border border-border/50 p-5 font-mono text-sm whitespace-pre-wrap text-cyan-300 overflow-x-auto">
          {chart}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {loading && (
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm font-mono opacity-60">
          Rendering diagram…
        </div>
      )}
      <div
        ref={containerRef}
        className={`overflow-x-auto ${loading ? "invisible h-0" : ""}`}
      />
    </div>
  );
}
