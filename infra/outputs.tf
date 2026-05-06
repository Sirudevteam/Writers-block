# ──────────────────────────────────────────────────────────────────────────────
# Terraform Outputs
# ──────────────────────────────────────────────────────────────────────────────

output "zone_name" {
  description = "Cloudflare zone name"
  value       = data.cloudflare_zone.main.name
}

output "zone_status" {
  description = "Cloudflare zone status (active, pending, etc.)"
  value       = data.cloudflare_zone.main.status
}

output "nameservers" {
  description = "Cloudflare nameservers to configure at your registrar"
  value       = data.cloudflare_zone.main.name_servers
}

output "waf_managed_ruleset_id" {
  description = "Managed WAF ruleset ID"
  value       = cloudflare_ruleset.waf_managed.id
}

output "waf_custom_ruleset_id" {
  description = "Custom WAF ruleset ID"
  value       = cloudflare_ruleset.waf_custom.id
}
