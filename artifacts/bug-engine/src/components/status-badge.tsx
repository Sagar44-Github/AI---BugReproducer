import { BugAnalysisStatus, BugAnalysisFullStatus } from "@workspace/api-client-react";
import { Badge } from "./ui/badge";
import { Loader2 } from "lucide-react";

type Status = BugAnalysisStatus | BugAnalysisFullStatus;

export function StatusBadge({ status }: { status: Status }) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="secondary" className="bg-muted text-muted-foreground border-muted-foreground/20">
          Pending
        </Badge>
      );
    case "running":
      return (
        <Badge className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Running
        </Badge>
      );
    case "completed":
      return (
        <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20">
          Completed
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20">
          Failed
        </Badge>
      );
    default:
      return null;
  }
}
