# ──────────────────────────────────────────────────────────────────────────────
# Cloudflare Resources
#
# DNS, WAF rulesets, security settings, and page rules.
# All changes are code-reviewed via PRs before `terraform apply`.
# ──────────────────────────────────────────────────────────────────────────────

# ── Data Source: Zone ────────────────────────────────────────────────────────

data "cloudflare_zone" "main" {
  zone_id = var.cloudflare_zone_id
}

# ── DNS Records ──────────────────────────────────────────────────────────────

# Primary domain → hosting platform (update 'value' to your hosting endpoint)
resource "cloudflare_record" "root" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  content = var.hosting_cname_target
  type    = "CNAME"
  proxied = true # Route through Cloudflare (enables WAF, CDN, DDoS protection)
  ttl     = 1    # Auto (proxied records ignore TTL)
  comment = "Primary domain - managed by Terraform"
}

# www redirect
resource "cloudflare_record" "www" {
  zone_id = var.cloudflare_zone_id
  name    = "www"
  content = var.hosting_cname_target
  type    = "CNAME"
  proxied = true
  ttl     = 1
  comment = "WWW subdomain - managed by Terraform"
}

# ── Zone Settings ────────────────────────────────────────────────────────────

resource "cloudflare_zone_settings_override" "security" {
  zone_id = var.cloudflare_zone_id

  settings {
    # TLS/SSL
    ssl                      = "strict"
    min_tls_version          = "1.2"
    tls_1_3                  = "on"
    automatic_https_rewrites = "on"
    always_use_https         = "on"

    # Security
    security_level  = "high"
    browser_check   = "on"
    challenge_ttl   = 1800
    privacy_pass    = "on"

    # Performance
    minify {
      css  = "on"
      js   = "on"
      html = "on"
    }
    brotli         = "on"
    early_hints    = "on"
    http3          = "on"
    zero_rtt       = "on"
    websockets     = "on"

    # Caching
    browser_cache_ttl    = 14400
    cache_level          = "aggressive"
    development_mode     = "off"

    # Email obfuscation & hotlink protection
    email_obfuscation    = "on"
    hotlink_protection   = "on"
    server_side_exclude  = "on"
  }
}

# ── WAF Managed Rules ───────────────────────────────────────────────────────

# Cloudflare Managed Ruleset (OWASP Core Rule Set + Cloudflare Specials)
resource "cloudflare_ruleset" "waf_managed" {
  zone_id     = var.cloudflare_zone_id
  name        = "WAF Managed Rules"
  description = "Cloudflare managed WAF rules - SQLi, XSS, RCE protection"
  kind        = "zone"
  phase       = "http_request_firewall_managed"

  # Enable Cloudflare Managed Ruleset
  rules {
    action = "execute"
    action_parameters {
      id = "efb7b8c949ac4650a09736fc376e9aee" # Cloudflare Managed Ruleset ID
    }
    expression  = "true"
    description = "Execute Cloudflare Managed Ruleset"
    enabled     = true
  }

  # Enable OWASP Core Rule Set
  rules {
    action = "execute"
    action_parameters {
      id = "4814384a9e5d4991b9815dcfc25d2f1f" # OWASP Core Rule Set ID
    }
    expression  = "true"
    description = "Execute OWASP Core Rule Set"
    enabled     = true
  }
}

# ── Custom WAF Rules ─────────────────────────────────────────────────────────

resource "cloudflare_ruleset" "waf_custom" {
  zone_id     = var.cloudflare_zone_id
  name        = "Custom WAF Rules"
  description = "Application-specific security rules"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  # Block requests with no User-Agent (common for automated attacks)
  rules {
    action      = "block"
    expression  = "(http.user_agent eq \"\")"
    description = "Block empty User-Agent"
    enabled     = true
  }

  # Challenge suspicious POST requests to auth endpoints
  rules {
    action      = "managed_challenge"
    expression  = "(http.request.uri.path contains \"/api/auth\" and http.request.method eq \"POST\" and cf.threat_score gt 10)"
    description = "Challenge suspicious auth attempts"
    enabled     = true
  }

  # Block known attack tool User-Agents
  rules {
    action      = "block"
    expression  = "(http.user_agent contains \"sqlmap\" or http.user_agent contains \"nikto\" or http.user_agent contains \"nmap\" or http.user_agent contains \"masscan\" or http.user_agent contains \"dirbuster\" or http.user_agent contains \"gobuster\")"
    description = "Block known attack tools"
    enabled     = true
  }

  # Rate limit API endpoints (100 requests per 10 seconds per IP)
  rules {
    action = "block"
    action_parameters {
      response {
        status_code  = 429
        content      = "{\"error\":\"Rate limit exceeded\"}"
        content_type = "application/json"
      }
    }
    ratelimit {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = 10
      requests_per_period = 100
      mitigation_timeout  = 60
    }
    expression  = "(http.request.uri.path matches \"^/api/.*\")"
    description = "Rate limit API endpoints"
    enabled     = true
  }

  # Block path traversal attempts
  rules {
    action      = "block"
    expression  = "(http.request.uri contains \"../\" or http.request.uri contains \"..%2f\" or http.request.uri contains \"%2e%2e\")"
    description = "Block path traversal"
    enabled     = true
  }
}

# ── Bot Management ───────────────────────────────────────────────────────────

resource "cloudflare_bot_management" "default" {
  zone_id                    = var.cloudflare_zone_id
  enable_js                  = true
  fight_mode                 = true
  optimize_wordpress         = false
  suppress_session_score     = false
}

# ── Page Rules ───────────────────────────────────────────────────────────────

# Cache static assets aggressively
resource "cloudflare_page_rule" "cache_static" {
  zone_id  = var.cloudflare_zone_id
  target   = "${var.domain}/_next/static/*"
  priority = 1

  actions {
    cache_level       = "cache_everything"
    edge_cache_ttl    = 2592000 # 30 days
    browser_cache_ttl = 2592000
  }
}

# Never cache API routes
resource "cloudflare_page_rule" "no_cache_api" {
  zone_id  = var.cloudflare_zone_id
  target   = "${var.domain}/api/*"
  priority = 2

  actions {
    cache_level          = "bypass"
    disable_performance  = true
  }
}
