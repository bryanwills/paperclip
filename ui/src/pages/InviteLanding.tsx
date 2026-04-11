import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AGENT_ADAPTER_TYPES } from "@paperclipai/shared";
import type { AgentAdapterType, JoinRequest } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { CompanyPatternIcon } from "@/components/CompanyPatternIcon";
import { Link, useNavigate, useParams } from "@/lib/router";
import { accessApi } from "../api/access";
import { authApi } from "../api/auth";
import { companiesApi } from "../api/companies";
import { healthApi } from "../api/health";
import { getAdapterLabel } from "../adapters/adapter-display-registry";
import { clearPendingInviteToken, rememberPendingInviteToken } from "../lib/invite-memory";
import { queryKeys } from "../lib/queryKeys";

type AuthMode = "sign_in" | "sign_up";

const joinAdapterOptions: AgentAdapterType[] = [...AGENT_ADAPTER_TYPES];
const ENABLED_INVITE_ADAPTERS = new Set([
  "claude_local",
  "codex_local",
  "gemini_local",
  "opencode_local",
  "pi_local",
  "cursor",
]);

function readNestedString(value: unknown, path: string[]): string | null {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" && current.trim().length > 0 ? current : null;
}

const fieldClassName =
  "w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500";

export function InviteLandingPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams();
  const token = (params.token ?? "").trim();
  const [authMode, setAuthMode] = useState<AuthMode>("sign_in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agentName, setAgentName] = useState("");
  const [adapterType, setAdapterType] = useState<AgentAdapterType>("claude_local");
  const [capabilities, setCapabilities] = useState("");
  const [result, setResult] = useState<{ kind: "bootstrap" | "join"; payload: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
  });
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  const inviteQuery = useQuery({
    queryKey: queryKeys.access.invite(token),
    queryFn: () => accessApi.getInvite(token),
    enabled: token.length > 0,
    retry: false,
  });

  const companiesQuery = useQuery({
    queryKey: queryKeys.companies.all,
    queryFn: () => companiesApi.list(),
    enabled: !!sessionQuery.data && !!inviteQuery.data?.companyId,
    retry: false,
  });

  useEffect(() => {
    if (token) rememberPendingInviteToken(token);
  }, [token]);

  useEffect(() => {
    if (!companiesQuery.data || !inviteQuery.data?.companyId) return;
    const isMember = companiesQuery.data.some(
      (c) => c.id === inviteQuery.data!.companyId
    );
    if (isMember) {
      clearPendingInviteToken(token);
      navigate("/", { replace: true });
    }
  }, [companiesQuery.data, inviteQuery.data, token, navigate]);

  const invite = inviteQuery.data;
  const companyName = invite?.companyName?.trim() || null;
  const companyDisplayName = companyName || "this Paperclip company";
  const companyLogoUrl = invite?.companyLogoUrl?.trim() || null;
  const companyBrandColor = invite?.companyBrandColor?.trim() || null;
  const invitedByUserName = invite?.invitedByUserName?.trim() || null;
  const requiresHumanAccount =
    healthQuery.data?.deploymentMode === "authenticated" &&
    !sessionQuery.data &&
    invite?.allowedJoinTypes !== "agent";
  const showsAgentForm = invite?.inviteType !== "bootstrap_ceo" && invite?.allowedJoinTypes === "agent";
  const sessionLabel =
    sessionQuery.data?.user.name?.trim() ||
    sessionQuery.data?.user.email?.trim() ||
    "this account";

  const authCanSubmit =
    email.trim().length > 0 &&
    password.trim().length > 0 &&
    (authMode === "sign_in" || (name.trim().length > 0 && password.trim().length >= 8));

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!invite) throw new Error("Invite not found");
      if (invite.inviteType === "bootstrap_ceo" || invite.allowedJoinTypes !== "agent") {
        return accessApi.acceptInvite(token, { requestType: "human" });
      }
      return accessApi.acceptInvite(token, {
        requestType: "agent",
        agentName: agentName.trim(),
        adapterType,
        capabilities: capabilities.trim() || null,
      });
    },
    onSuccess: async (payload) => {
      setError(null);
      clearPendingInviteToken(token);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      const asBootstrap =
        payload && typeof payload === "object" && "bootstrapAccepted" in (payload as Record<string, unknown>);
      setResult({ kind: asBootstrap ? "bootstrap" : "join", payload });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    },
  });

  const authMutation = useMutation({
    mutationFn: async () => {
      if (authMode === "sign_in") {
        await authApi.signInEmail({ email: email.trim(), password });
        return;
      }
      await authApi.signUpEmail({
        name: name.trim(),
        email: email.trim(),
        password,
      });
    },
    onSuccess: async () => {
      setAuthError(null);
      rememberPendingInviteToken(token);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
    onError: (err) => {
      setAuthError(err instanceof Error ? err.message : "Authentication failed");
    },
  });

  const joinButtonLabel = useMemo(() => {
    if (!invite) return "Continue";
    if (invite.inviteType === "bootstrap_ceo") return "Accept invite";
    if (showsAgentForm) return "Submit";
    return "Join company";
  }, [invite, showsAgentForm]);

  if (!token) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-destructive">Invalid invite token.</div>;
  }

  if (inviteQuery.isLoading || healthQuery.isLoading || sessionQuery.isLoading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading invite...</div>;
  }

  if (inviteQuery.error || !invite) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="border border-border bg-card p-6" data-testid="invite-error">
          <h1 className="text-lg font-semibold">Invite not available</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This invite may be expired, revoked, or already used.
          </p>
        </div>
      </div>
    );
  }

  if (result?.kind === "bootstrap") {
    return (
      <div className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
        <div className="mx-auto max-w-md border border-zinc-800 bg-zinc-950 p-6">
          <h1 className="text-lg font-semibold">Bootstrap complete</h1>
          <div className="mt-4">
            <Button asChild className="rounded-none">
              <Link to="/">Open board</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (result?.kind === "join") {
    const payload = result.payload as JoinRequest & {
      claimSecret?: string;
      claimApiKeyPath?: string;
      onboarding?: Record<string, unknown>;
    };
    const claimSecret = typeof payload.claimSecret === "string" ? payload.claimSecret : null;
    const claimApiKeyPath = typeof payload.claimApiKeyPath === "string" ? payload.claimApiKeyPath : null;
    const onboardingTextUrl = readNestedString(payload.onboarding, ["textInstructions", "url"]);
    const joinedNow = !showsAgentForm && payload.status === "approved";
    const approvalUrl = `${window.location.origin}/company/settings/access`;

    return (
      <div className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
        <div className="mx-auto max-w-md border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-center gap-3">
            <CompanyPatternIcon
              companyName={companyDisplayName}
              logoUrl={companyLogoUrl}
              brandColor={companyBrandColor}
              className="h-12 w-12 border border-zinc-800 rounded-none"
            />
            <h1 className="text-lg font-semibold">
              {joinedNow ? "You joined the company" : "Request submitted"}
            </h1>
          </div>
          {joinedNow ? (
            <div className="mt-4">
              <Button asChild className="w-full rounded-none">
                <Link to="/">Open board</Link>
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-zinc-400">
                {invitedByUserName
                  ? `${invitedByUserName} must approve your request to join.`
                  : "Your request is pending approval."}
                {" "}Ask them to visit the link below to approve it.
              </p>
              <div className="border border-zinc-800 p-3">
                <p className="text-xs text-zinc-500 mb-1">Approval page</p>
                <a
                  href={approvalUrl}
                  className="text-sm text-zinc-200 font-mono break-all underline underline-offset-2 hover:text-zinc-100"
                >
                  {approvalUrl}
                </a>
              </div>
              <p className="text-xs text-zinc-500">
                Refresh this page after you've been approved — you'll be redirected automatically.
              </p>
            </div>
          )}
          {claimSecret && claimApiKeyPath ? (
            <div className="mt-4 space-y-1 border border-zinc-800 p-3 text-xs text-zinc-400">
              <div className="text-zinc-200">Claim secret</div>
              <div className="font-mono break-all">{claimSecret}</div>
              <div className="font-mono break-all">POST {claimApiKeyPath}</div>
            </div>
          ) : null}
          {onboardingTextUrl ? (
            <div className="mt-4 text-xs text-zinc-400">
              Onboarding: <span className="font-mono break-all">{onboardingTextUrl}</span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-md border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex items-center gap-3">
          <CompanyPatternIcon
            companyName={companyDisplayName}
            logoUrl={companyLogoUrl}
            brandColor={companyBrandColor}
            className="h-12 w-12 border border-zinc-800 rounded-none"
          />
          <div>
            <h1 className="text-lg font-semibold">
              {invite.inviteType === "bootstrap_ceo" ? "Set up Paperclip" : `Join ${companyDisplayName}`}
            </h1>
            {sessionQuery.data ? (
              <p className="mt-1 text-sm text-zinc-400">Signed in as {sessionLabel}</p>
            ) : null}
          </div>
        </div>

        {showsAgentForm ? (
          <div className="mt-6 space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-400">Agent name</span>
              <input
                className={fieldClassName}
                value={agentName}
                onChange={(event) => setAgentName(event.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-400">Adapter type</span>
              <select
                className={fieldClassName}
                value={adapterType}
                onChange={(event) => setAdapterType(event.target.value as AgentAdapterType)}
              >
                {joinAdapterOptions.map((type) => (
                  <option key={type} value={type} disabled={!ENABLED_INVITE_ADAPTERS.has(type)}>
                    {getAdapterLabel(type)}{!ENABLED_INVITE_ADAPTERS.has(type) ? " (Coming soon)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-400">Capabilities</span>
              <textarea
                className={fieldClassName}
                rows={4}
                value={capabilities}
                onChange={(event) => setCapabilities(event.target.value)}
              />
            </label>
            {error ? <p className="text-xs text-red-400">{error}</p> : null}
            <Button
              className="w-full rounded-none"
              disabled={acceptMutation.isPending || agentName.trim().length === 0}
              onClick={() => acceptMutation.mutate()}
            >
              {acceptMutation.isPending ? "Working..." : joinButtonLabel}
            </Button>
          </div>
        ) : requiresHumanAccount ? (
          <div className="mt-6">
            <form
              className="space-y-4"
              method="post"
              action={authMode === "sign_up" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email"}
              onSubmit={(event) => {
                event.preventDefault();
                if (authMutation.isPending) return;
                if (!authCanSubmit) {
                  setAuthError("Please fill in all required fields.");
                  return;
                }
                authMutation.mutate();
              }}
              data-testid="invite-inline-auth"
            >
              {authMode === "sign_up" ? (
                <label className="block text-sm">
                  <span className="mb-1 block text-zinc-400">Name</span>
                  <input
                    name="name"
                    className={fieldClassName}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                  />
                </label>
              ) : null}
              <label className="block text-sm">
                <span className="mb-1 block text-zinc-400">Email</span>
                <input
                  name="email"
                  type="email"
                  className={fieldClassName}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-zinc-400">Password</span>
                <input
                  name="password"
                  type="password"
                  className={fieldClassName}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={authMode === "sign_in" ? "current-password" : "new-password"}
                />
              </label>
              {authError ? <p className="text-xs text-red-400">{authError}</p> : null}
              <Button
                type="submit"
                className="w-full rounded-none"
                disabled={authMutation.isPending}
                aria-disabled={!authCanSubmit || authMutation.isPending}
              >
                {authMutation.isPending
                  ? "Working..."
                  : authMode === "sign_in"
                    ? "Sign in"
                    : "Create account"}
              </Button>
            </form>

            <div className="mt-3">
              <button
                type="button"
                className="text-sm text-zinc-400 underline underline-offset-2"
                onClick={() => {
                  setAuthError(null);
                  setAuthMode(authMode === "sign_in" ? "sign_up" : "sign_in");
                }}
              >
                {authMode === "sign_in" ? "Create account" : "Back to sign in"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            {error ? <p className="mb-3 text-xs text-red-400">{error}</p> : null}
            <Button
              className="w-full rounded-none"
              disabled={acceptMutation.isPending}
              onClick={() => acceptMutation.mutate()}
            >
              {acceptMutation.isPending ? "Working..." : joinButtonLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
