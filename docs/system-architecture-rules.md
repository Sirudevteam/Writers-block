# System Architecture Rules

**Last updated:** May 5, 2026
**Objective:** Define a secure, scalable, enterprise-grade system flow for all client interactions across web and mobile platforms.

## Current Implementation Mapping

Writers Block is currently a Next.js/Supabase application deployed behind Cloudflare. For this phase, Cloudflare plus Next.js middleware is the hardened perimeter for the monolith.

- Cloudflare provides CDN, WAF, DDoS protection, bot filtering, TLS enforcement, and static asset caching.
- Next.js middleware provides the app-side WAF, CSRF checks, request correlation, session refresh, protected API authentication, dashboard/editor guards, and Master Admin host/operator/MFA checks.
- API route policy is centralized in `src/core/security/api-route-policy.ts`: `/api/auth/*` and `/api/support/tickets` are public, `/api/razorpay/webhook`, `/api/cron/*`, `/api/jobs/*`, and `/api/scim/*` are machine-auth routes, `/api/master-admin/*` uses the Master Admin guard path, and all other APIs require a Supabase Auth session before route handlers run.
- Route handlers still perform domain authorization such as org RBAC, Master Admin privilege checks, payment HMAC validation, service-role RPCs, and rate limits.
- Kong/NGINX gateway deployment, Kubernetes orchestration, MinIO object storage, and extracted microservices remain future platform work until service boundaries justify independent deployment and scaling.

## Final Principle

> "Security first, scalability always, and zero trust by default."

## 1. Client Layer

### Components

- Web application: React / Next.js
- Mobile application: Flutter / React Native

### Rules

- All traffic must go through HTTPS.
- No direct API access is allowed without CDN/WAF protection.
- Token-based authentication is required for all protected routes.

## 2. CDN / WAF Layer

### Platform

- Cloudflare

### Responsibilities

- DDoS protection
- Rate limiting
- Bot filtering
- Edge caching

### Rules

- Block malicious IPs automatically.
- Enforce geo-restrictions when required by product, compliance, or threat model.
- Cache static assets aggressively.

## 3. API Gateway Layer

### Platforms

- Kong
- NGINX

### Responsibilities

- Request routing
- Load balancing
- API rate limiting
- Logging and monitoring

### Rules

- All services must be accessed through the API gateway.
- Enforce JWT validation at the gateway level.
- Centralized request logging is required.

## 4. Identity Layer

### Components

- Auth service: OAuth2 / OpenID Connect
- MFA service: TOTP / WebAuthn
- Session service

### Rules

- Use OAuth2 and OIDC for authentication.
- MFA is mandatory for sensitive actions.
- Sessions must be short-lived and stored securely.
- Use refresh tokens with rotation.

## 5. Authorization Layer

### Components

- RBAC engine: Role-Based Access Control
- ABAC engine: Attribute-Based Access Control
- PDP: Policy Decision Point

### Rules

- Every request must pass an authorization check.
- Use RBAC for standard roles such as Admin and User.
- Use ABAC for dynamic conditions such as location, time, and device.
- Policies must be centrally managed.

## 6. Application Layer

### Services

- User Service
- Billing Service
- Admin Dashboard

### Rules

- Follow a microservices architecture when service boundaries justify independent deployment and scaling.
- Each service must be stateless.
- Services communicate through REST or gRPC.
- Implement circuit breakers and retries for service-to-service calls.

## 7. Data Layer

### Components

- Encrypted databases: Supabase
- Object storage: MinIO

### Rules

- Data must be encrypted at rest and in transit.
- Use role-based database access.
- Regular backups are required.
- Audit logs must be immutable.

## 8. Security And Compliance Rules

- Enforce Zero Trust Architecture.
- All APIs must require authentication unless explicitly classified as public.
- Use HTTPS everywhere with TLS 1.2 or newer.
- Run regular vulnerability scans.
- Maintain GDPR, ISO, and SOC2 alignment when applicable.

## 9. Observability

### Tools

- Prometheus for metrics
- Grafana for dashboards
- ELK Stack for logs
- Jaeger for distributed tracing

### Rules

- All services must emit logs and metrics.
- Alerts are required for failures and anomalies.
- Distributed tracing must be enabled for cross-service request paths.

## 10. Scalability And Performance

- Use Kubernetes for orchestration when the runtime moves beyond managed single-app deployment.
- Auto-scale based on CPU, traffic, and queue depth where applicable.
- Use CDN delivery for global performance.
- Cache frequently accessed data with Redis.
