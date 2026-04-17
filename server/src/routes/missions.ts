import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { forbidden, unauthorized } from "../errors.js";
import { accessService } from "../services/access.js";
import { agentService } from "../services/agents.js";
import { logActivity } from "../services/activity-log.js";
import { issueService } from "../services/issues.js";
import { missionInitializationService } from "../services/mission-initialization.js";
import { missionSummaryService } from "../services/mission-summary.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

const initMissionSchema = z.object({}).strict();

function canCreateAgentsLegacy(agent: { permissions: Record<string, unknown> | null | undefined; role: string }) {
  if (agent.role === "ceo") return true;
  if (!agent.permissions || typeof agent.permissions !== "object") return false;
  return Boolean((agent.permissions as Record<string, unknown>).canCreateAgents);
}

export function missionRoutes(db: Db) {
  const router = Router();
  const issuesSvc = issueService(db);
  const missions = missionInitializationService(db);
  const missionSummaries = missionSummaryService(db);
  const access = accessService(db);
  const agents = agentService(db);

  async function assertCanInitializeMission(
    req: Request,
    issue: { companyId: string; assigneeAgentId: string | null },
  ) {
    assertCompanyAccess(req, issue.companyId);
    if (req.actor.type === "board") return;
    if (req.actor.type !== "agent" || !req.actor.agentId) throw unauthorized("Agent authentication required");
    if (issue.assigneeAgentId === req.actor.agentId) return;
    const allowedByGrant = await access.hasPermission(issue.companyId, "agent", req.actor.agentId, "tasks:assign");
    if (allowedByGrant) return;
    const actorAgent = await agents.getById(req.actor.agentId);
    if (actorAgent && actorAgent.companyId === issue.companyId && canCreateAgentsLegacy(actorAgent)) return;
    throw forbidden("Missing permission: tasks:assign");
  }

  async function assertAgentRunCheckoutOwnership(
    req: Request,
    res: Response,
    issue: { id: string; companyId: string; status: string; assigneeAgentId: string | null },
  ) {
    if (req.actor.type !== "agent") return true;
    const actorAgentId = req.actor.agentId;
    if (!actorAgentId) {
      res.status(403).json({ error: "Agent authentication required" });
      return false;
    }
    if (issue.status !== "in_progress" || issue.assigneeAgentId !== actorAgentId) return true;
    const runId = req.actor.runId?.trim();
    if (!runId) {
      res.status(401).json({ error: "Agent run id required" });
      return false;
    }
    await issuesSvc.assertCheckoutOwner(issue.id, actorAgentId, runId);
    return true;
  }

  router.post("/issues/:id/mission/init", validate(initMissionSchema), async (req, res) => {
    const id = req.params.id as string;
    const issue = await issuesSvc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCanInitializeMission(req, issue);
    if (!(await assertAgentRunCheckoutOwnership(req, res, issue))) return;

    const actor = getActorInfo(req);
    const result = await missions.initialize(issue.id, {
      actor: {
        agentId: actor.agentId ?? null,
        userId: actor.actorType === "user" ? actor.actorId : null,
        runId: actor.runId ?? null,
      },
    });

    if (result.createdDocumentKeys.length > 0 || result.metadataUpdated) {
      await logActivity(db, {
        companyId: issue.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "issue.mission_initialized",
        entityType: "issue",
        entityId: issue.id,
        details: {
          createdDocumentKeys: result.createdDocumentKeys,
          existingDocumentKeys: result.existingDocumentKeys,
          metadataUpdated: result.metadataUpdated,
          originKind: result.originKind,
          originId: result.originId,
          billingCode: result.billingCode,
          commentId: result.commentId,
        },
      });
    }

    res.status(result.createdDocumentKeys.length > 0 || result.metadataUpdated ? 201 : 200).json(result);
  });

  router.get("/issues/:id/mission-summary", async (req, res) => {
    const id = req.params.id as string;
    const issue = await issuesSvc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);
    const summary = await missionSummaries.getSummary(issue.id);
    res.json(summary);
  });

  return router;
}
