# Enterprise IAM, SSO, and SCIM

**Last updated:** May 6, 2026

Writers Block now implements organization IAM, tenant security policy, Supabase SAML SSO entry, and app-owned SCIM provisioning on top of Supabase Auth.

## What Exists

- **Identity**: Supabase Auth sessions stored in HTTP-only cookies. Middleware refreshes sessions and protected server paths use `getUser()` semantics.
- **Organizations**: `public.organizations` and `public.organization_members` are the tenant boundary.
- **Roles**: membership role is `owner | admin | member | billing`.
- **Active org**: `wb_active_org` secure cookie.
- **Invites**: `GET/POST /api/org/invites`, `PATCH/DELETE /api/org/invites/:id`, and `POST /api/org/invites/accept`.
- **Tenant policy**: `GET/PATCH /api/org/security-policy` controls verified domains, MFA, SSO, password-login disablement, session duration, SSO provider metadata, and SCIM token state.
- **SSO**: `POST /api/auth/sso/start` starts Supabase SAML SSO; `/auth/callback` exchanges the session and joins users by invite or verified domain policy.
- **SCIM**: `/api/scim/v2/:orgId/Users` supports machine-authenticated user provisioning with hashed bearer tokens.
- **Audit logs**: `public.iam_audit_log` records org actions; Master Admin has separate audit and security/business event tables.

## Role Permissions

| Role | Main permissions |
|---|---|
| `owner` | Org read, member read/manage/invite, security read/manage, project read/write, billing read/manage, audit read |
| `admin` | Org read, member read/manage/invite, security read, project read/write, billing read, audit read |
| `member` | Org read, member read, project read/write |
| `billing` | Org read, member read, billing read |

Owners, not admins, control billing, SSO, SCIM, tenant security policy, and destructive account/org actions.

## Sensitive Auth Gates

`guardOrgApi(...)` enforces:

- App permission checks from `src/modules/iam/domain/permissions.ts`.
- AAL2 for privileged actions: member management, invites, security policy management, billing management, and audit reads.
- Tenant `require_mfa` for every org API once enabled.
- Tenant `require_sso` / `disable_password_login` by blocking email-provider sessions for that org.
- Tenant `session_duration_minutes` using the Supabase access token `iat`.

Password sign-in/sign-up also checks org SSO domain policy and blocks email/password auth when a matching organization requires SSO or disables password login.

## SSO Join Rules

The callback never trusts email alone as identity. It binds access by:

1. Supabase user UUID.
2. Active organization membership.
3. Invite acceptance for exact email, or verified-domain join when `sso_join_policy = 'invite_or_domain'`.

Supabase SSO accounts do not auto-link to password accounts, so organization membership is the app authorization boundary.

## SCIM Rules

- SCIM tokens are generated only through `PATCH /api/org/security-policy` with `rotateScimToken: true`.
- Only the SHA-256 token hash is stored in `organization_security_policies.scim_token_hash`.
- `scim_provisioned_users` records external id, username, role, active state, optional linked Supabase user id, and raw provider payload.
- Provisioning links an existing profile by exact email when present, then syncs organization membership.
- Deprovisioning marks the SCIM row inactive, removes org membership, and revokes app sessions.
- SCIM cannot demote existing org owners.

## Development Rules

- API routes should call `guardOrgApi(...)` before reading or writing org-owned resources.
- Project reads and writes should go through `modules/projects/application/project-service.ts`.
- Do not query project rows by `user_id` alone for new app features; use `org_id`.
- Store invite/SCIM secrets only as hashes.
- Keep `src/core/security/api-route-policy.ts` aligned: SCIM is machine-authenticated, support tickets are public intake, and normal org/billing/project APIs are protected.
