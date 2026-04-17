// @vitest-environment jsdom

import { act } from "react";
import type React from "react";
import { createRoot } from "react-dom/client";
import {
  MISSION_REQUIRED_DOCUMENT_KEYS,
  type IssueBackedMissionSummary,
  type MissionSummaryIssue,
} from "@paperclipai/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionSummaryPanel } from "./MissionSummaryPanel";

vi.mock("@/lib/router", () => ({
  Link: ({ children, to, className, title }: {
    children: React.ReactNode;
    to: string;
    className?: string;
    title?: string;
  }) => (
    <a href={to} className={className} title={title}>
      {children}
    </a>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function makeIssue(overrides: Partial<MissionSummaryIssue> = {}): MissionSummaryIssue {
  return {
    id: "issue-1",
    identifier: "PAP-1",
    title: "Mission work",
    status: "todo",
    priority: "medium",
    originKind: "mission_feature",
    originId: "mission-1:feature:FEAT-MISSION-001",
    assigneeAgentId: null,
    assigneeUserId: null,
    executionRunId: null,
    blockedBy: [],
    ...overrides,
  };
}

function makeSummary(overrides: Partial<IssueBackedMissionSummary> = {}): IssueBackedMissionSummary {
  return {
    missionIssueId: "mission-1",
    missionIdentifier: "PAP-1533",
    state: "planning",
    documentChecklist: MISSION_REQUIRED_DOCUMENT_KEYS.map((key) => ({
      key,
      title: key,
      present: true,
      latestRevisionNumber: 1,
      updatedAt: new Date("2026-04-17T22:00:00.000Z"),
    })),
    missing_required_document_keys: [],
    documentErrors: [],
    milestones: [
      {
        key: "MILESTONE-MISSION-001",
        title: "Foundation",
        summary: "Mission foundation",
        issue: makeIssue({
          id: "milestone-1",
          identifier: "PAP-10",
          title: "Mission milestone: Foundation",
          originKind: "mission_milestone",
        }),
        features: [makeIssue()],
        validations: [],
        fixLoops: [],
        blockers: [],
      },
    ],
    blockers: [],
    activeWork: [makeIssue()],
    runSummary: {
      total: 0,
      active: 0,
      latestRunId: null,
      latestRunStatus: null,
    },
    costSummary: {
      costCents: 0,
      inputTokens: 0,
      outputTokens: 0,
    },
    next_action: "Decompose the mission into milestone and feature issues.",
    ...overrides,
  };
}

async function renderPanel(summary: IssueBackedMissionSummary) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<MissionSummaryPanel summary={summary} />);
  });
  return { container, root };
}

describe("MissionSummaryPanel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows missing mission documents as an incomplete checklist", async () => {
    const summary = makeSummary({
      state: "draft",
      documentChecklist: MISSION_REQUIRED_DOCUMENT_KEYS.map((key) => ({
        key,
        title: null,
        present: false,
        latestRevisionNumber: null,
        updatedAt: null,
      })),
      missing_required_document_keys: [...MISSION_REQUIRED_DOCUMENT_KEYS],
      milestones: [],
      activeWork: [],
      next_action: "Complete required mission documents: plan, mission-brief.",
    });

    const { container, root } = await renderPanel(summary);

    expect(container.textContent).toContain("Draft");
    expect(container.textContent).toContain("0/8");
    expect(container.textContent).toContain("mission-brief");
    expect(container.textContent).toContain("Complete required mission documents");

    await act(async () => root.unmount());
  });

  it("surfaces blocked child work with blocker context", async () => {
    const blocker = {
      id: "blocker-1",
      identifier: "PAP-9",
      title: "Finish prerequisite",
      status: "todo" as const,
      priority: "medium" as const,
      assigneeAgentId: null,
      assigneeUserId: null,
    };
    const blockedFeature = makeIssue({
      id: "feature-1",
      identifier: "PAP-11",
      status: "blocked",
      blockedBy: [blocker],
    });
    const summary = makeSummary({
      state: "blocked",
      blockers: [{ issue: blockedFeature, blockers: [blocker] }],
      activeWork: [blockedFeature],
      milestones: [
        {
          key: "MILESTONE-MISSION-001",
          title: "Foundation",
          summary: null,
          issue: null,
          features: [blockedFeature],
          validations: [],
          fixLoops: [],
          blockers: [{ issue: blockedFeature, blockers: [blocker] }],
        },
      ],
      next_action: "Resolve blocking issues before advancing mission work.",
    });

    const { container, root } = await renderPanel(summary);

    expect(container.textContent).toContain("Blocked");
    expect(container.textContent).toContain("Blockers");
    expect(container.textContent).toContain("Waiting on PAP-9");
    expect(container.textContent).toContain("1 blocked item");

    await act(async () => root.unmount());
  });

  it("shows complete docs and milestone grouping without errors", async () => {
    const summary = makeSummary();

    const { container, root } = await renderPanel(summary);

    expect(container.textContent).toContain("Planning");
    expect(container.textContent).toContain("8/8");
    expect(container.textContent).toContain("Foundation");
    expect(container.textContent).toContain("1 features - 0 validations - 0 fix loops");
    expect(container.textContent).not.toContain("Document errors");

    await act(async () => root.unmount());
  });
});
