# ──────────────────────────────────────────────────────────────────────────────
# Writers Block — Terraform Root Configuration
#
# Manages Cloudflare infrastructure (DNS, WAF rules, security settings)
# State stored in Terraform Cloud.
# ──────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.5"

  cloud {
    organization = "siru-ai-labs"

    workspaces {
      name = "writersblock-production"
    }
  }

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

# ── Providers ────────────────────────────────────────────────────────────────

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
