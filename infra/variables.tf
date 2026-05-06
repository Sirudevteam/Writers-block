# ──────────────────────────────────────────────────────────────────────────────
# Terraform Variables
#
# All sensitive values are marked `sensitive = true` and should be set in
# Terraform Cloud workspace variables (never committed to git).
# ──────────────────────────────────────────────────────────────────────────────

# ── Cloudflare ───────────────────────────────────────────────────────────────

variable "cloudflare_api_token" {
  description = "Cloudflare API token with Zone:Edit, DNS:Edit, Firewall:Edit permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for the primary domain"
  type        = string
}

variable "domain" {
  description = "Primary domain name (e.g., writersblock.app)"
  type        = string
}

variable "hosting_cname_target" {
  description = "CNAME target for the hosting platform (e.g., cname.vercel-dns.com for Vercel, or your-project.pages.dev for CF Pages)"
  type        = string
  default     = "cname.vercel-dns.com"
}

# ── Environment ──────────────────────────────────────────────────────────────

variable "environment" {
  description = "Deployment environment (production, staging, development)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Environment must be one of: production, staging, development."
  }
}
