import type { IssueBackedMissionSummary, MissionSummaryIssue } from "@paperclipai/shared";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileCheck2,
  ListChecks,
  Route,
} from "lucide-react";
import { Link } from "@/lib/router";
import { createIssueDetailPath } from "@/lib/issueDetailBreadcrumb";
import { cn } from "@/lib/utils";

type MissionSummaryPanelProps = {
  summary?: IssueBackedMissionSummary | null;
  isLoading?: boolean;
  error?: Error | null;
};

const stateLabels: Record<IssueBackedMissionSummary["state"], string> = {
  draft: "Draft",
  planning: "Planning",
  ready_for_approval: "Ready for approval",
  running: "Running",
  validating: "Validating",
  fixing: "Fixing",
  blocked: "Blocked",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatCost(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function statusTone(status: MissionSummaryIssue["status"]) {
  if (status === "done") return "text-emerald-600 dark:text-emerald-400";
  if (status === "blocked") return "text-amber-700 dark:text-amber-300";
  if (status === "cancelled") return "text-muted-foreground";
  if (status === "in_progress" || status === "in_review") return "text-cyan-700 dark:text-cyan-300";
  return "text-foreground";
}

function issueLabel(issue: Pick<MissionSummaryIssue, "identifier" | "title">) {
  return issue.identifier ? `${issue.identifier} ${issue.title}` : issue.title;
}

function IssuePill({ issue }: { issue: MissionSummaryIssue }) {
  return (
    <Link
      to={createIssueDetailPath(issue.identifier ?? issue.id)}
      className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent/50"
      title={issueLabel(issue)}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full bg-current", statusTone(issue.status))} />
      <span className="truncate">{issue.identifier ?? issue.id.slice(0, 8)}</span>
      <span className="text-muted-foreground">{issue.status.replace("_", " ")}</span>
    </Link>
  );
}

export function MissionSummaryPanel({ summary, isLoading = false, error = null }: MissionSummaryPanelProps) {
  if (isLoading) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="h-4 w-36 rounded bg-muted" />
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-16 rounded-md bg-muted/70" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <h3 className="font-medium">Mission summary unavailable</h3>
            <p className="mt-1 text-destructive/80">{error.message || "The mission summary could not be loaded."}</p>
          </div>
        </div>
      </section>
    );
  }

  if (!summary) return null;

  const completedDocuments = summary.documentChecklist.filter((item) => item.present).length;
  const openMilestoneCount = summary.milestones.filter((milestone) => milestone.issue?.status !== "done").length;
  const activeWork = summary.activeWork.slice(0, 6);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Route className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            Mission summary
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{summary.next_action}</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
            summary.state === "blocked"
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
          )}
        >
          {summary.state === "blocked" ? <Ban className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
          {stateLabels[summary.state]}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <div className="rounded-md border border-border bg-background p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileCheck2 className="h-3.5 w-3.5" />
            Documents
          </div>
          <div className="mt-1 text-lg font-semibold">
            {completedDocuments}/{summary.documentChecklist.length}
          </div>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5" />
            Milestones
          </div>
          <div className="mt-1 text-lg font-semibold">{openMilestoneCount}</div>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            Runs
          </div>
          <div className="mt-1 text-lg font-semibold">
            {summary.runSummary.active}/{summary.runSummary.total}
          </div>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <div className="text-xs text-muted-foreground">Cost</div>
          <div className="mt-1 text-lg font-semibold">{formatCost(summary.costSummary.costCents)}</div>
        </div>
      </div>

      {summary.documentErrors.length > 0 && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Document errors
          </div>
          <ul className="mt-2 space-y-1">
            {summary.documentErrors.map((item) => (
              <li key={item.key}>
                <span className="font-mono">{item.key}</span>: {item.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
        <div className="space-y-3">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Milestone groups</h4>
          {summary.milestones.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
              No milestone issues yet
            </div>
          ) : (
            summary.milestones.map((milestone) => (
              <div key={milestone.key} className="rounded-md border border-border bg-background p-3">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{milestone.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {milestone.features.length} features - {milestone.validations.length} validations - {milestone.fixLoops.length} fix loops
                    </div>
                  </div>
                  {milestone.issue ? <IssuePill issue={milestone.issue} /> : null}
                </div>
                {milestone.blockers.length > 0 && (
                  <div className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                    {milestone.blockers.length} blocked item{milestone.blockers.length === 1 ? "" : "s"}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Document checklist</h4>
            <div className="mt-2 grid gap-1.5">
              {summary.documentChecklist.map((item) => (
                <div key={item.key} className="flex items-center gap-2 text-sm">
                  {item.present ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn("truncate", !item.present && "text-muted-foreground")}>{item.key}</span>
                </div>
              ))}
            </div>
          </div>

          {summary.blockers.length > 0 && (
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Blockers</h4>
              <div className="mt-2 space-y-2">
                {summary.blockers.slice(0, 4).map((item) => (
                  <div key={item.issue.id} className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                    <IssuePill issue={item.issue} />
                    <div className="mt-1 text-xs text-muted-foreground">
                      Waiting on {item.blockers.map((blocker) => blocker.identifier ?? blocker.id.slice(0, 8)).join(", ") || "unresolved state"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeWork.length > 0 && (
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active work</h4>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {activeWork.map((issue) => <IssuePill key={issue.id} issue={issue} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
