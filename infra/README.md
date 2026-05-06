# Infrastructure as Code (Terraform)

**Last updated:** May 4, 2026

This directory manages Writers Block's cloud infrastructure using Terraform with the Cloudflare provider.

Current Terraform Cloud workspace: `siru-ai-labs/writersblock-production`.

## Prerequisites

1. **Terraform CLI** (v1.5+): [Install Guide](https://developer.hashicorp.com/terraform/install)
2. **Terraform Cloud account**: [Sign up (free)](https://app.terraform.io/signup)
3. **Cloudflare API Token** with permissions:
   - Zone → Zone Settings → Edit
   - Zone → DNS → Edit
   - Zone → Firewall Services → Edit
   - Zone → Page Rules → Edit

## Setup

### 1. Terraform Cloud Configuration

```bash
# Login to Terraform Cloud
terraform login

# Update main.tf with your organization name
# Then initialize:
cd infra
terraform init
```

### 2. Configure Variables

Set these variables in your **Terraform Cloud workspace** (Settings → Variables):

| Variable | Type | Sensitive | Description |
|---|---|---|---|
| `cloudflare_api_token` | Environment | Yes | Cloudflare API token |
| `cloudflare_zone_id` | Terraform | No | Zone ID from Cloudflare dashboard |
| `domain` | Terraform | No | e.g., `writersblock.app` |
| `hosting_cname_target` | Terraform | No | e.g., `cname.vercel-dns.com` |
| `environment` | Terraform | No | `production` / `staging` |

### 3. Import Existing Resources

If you already have Cloudflare resources configured via the dashboard:

```bash
# Import existing DNS records
terraform import cloudflare_record.root <zone_id>/<record_id>
terraform import cloudflare_record.www <zone_id>/<record_id>

# Find record IDs via:
curl -X GET "https://api.cloudflare.com/client/v4/zones/<zone_id>/dns_records" \
  -H "Authorization: Bearer <api_token>"
```

## Usage

### Preview Changes

```bash
terraform plan
```

### Apply Changes

```bash
terraform apply
```

### Adding New DNS Records

Add to `cloudflare.tf`:

```hcl
resource "cloudflare_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = "api"
  content = "your-api-server.example.com"
  type    = "CNAME"
  proxied = true
  ttl     = 1
  comment = "API subdomain - managed by Terraform"
}
```

Then run `terraform plan` → `terraform apply`.

## What's Managed

| Resource | Description |
|---|---|
| DNS Records | `@`, `www` CNAME records (proxied through Cloudflare). Add an explicit admin hostname record if `ADMIN_HOSTS` uses a dedicated subdomain. |
| Zone Settings | SSL (strict), TLS 1.2+, security level, caching, compression |
| WAF Managed Rules | Cloudflare Managed Ruleset + OWASP Core Rule Set |
| WAF Custom Rules | Empty UA blocking, auth challenges, attack tool blocking, rate limiting |
| Bot Management | JavaScript challenge, fight mode |
| Page Rules | Static asset caching, API bypass |

## Application Integration Notes

Cloudflare sits in front of Vercel. It should absorb broad edge concerns while the Next.js app handles user/session-specific authorization.

- Public pages, especially `/`, should remain cache-friendly and outside the Next.js middleware matcher.
- API routes and authenticated app routes still pass through app middleware for auth, CSRF, WAF checks, and org/admin guards.
- Do not cache authenticated HTML, dashboard responses, Master Admin responses, webhooks, or cron responses at Cloudflare.
- Keep static assets aggressively cached; Next.js hashed assets are safe to cache long term.
- Master Admin should normally use a dedicated hostname in `ADMIN_HOSTS`, for example `admin.example.com`, and can be additionally restricted with Cloudflare access rules or IP allowlists.
- Razorpay webhooks must bypass challenge pages and browser-only bot protections so Razorpay can post server-to-server events reliably.
- The current app middleware still performs application-level WAF/CSRF/auth checks behind Cloudflare; Terraform does not replace route-level authorization.

## Related Docs

- [../docs/security-architecture.md](../docs/security-architecture.md) for WAF, middleware scope, audit logs, and incident response.
- [../docs/performance-architecture.md](../docs/performance-architecture.md) for current rendering and caching constraints.
- [../docs/admin-operators.md](../docs/admin-operators.md) for Master Admin host and operator setup.

## CI/CD Integration

Add to `.github/workflows/terraform.yml` for PR-based infra reviews:

```yaml
name: Terraform Plan
on:
  pull_request:
    paths: ['infra/**']
jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - run: terraform init
        working-directory: infra
      - run: terraform plan -no-color
        working-directory: infra
        env:
          TF_API_TOKEN: ${{ secrets.TF_API_TOKEN }}
```

## Troubleshooting

| Issue | Solution |
|---|---|
| `Error: zone not found` | Verify `cloudflare_zone_id` is correct |
| `Error: authentication error` | Regenerate API token with correct permissions |
| `Error: resource already exists` | Use `terraform import` to adopt existing resources |
| State lock conflicts | Check Terraform Cloud for active runs |
