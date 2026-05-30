# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately via [GitHub Security Advisories](https://github.com/netcookies/MaDao/security/advisories/new).

Do not open a public issue for security vulnerabilities.

## Supported Versions

Security fixes are applied to the latest release only. There is no LTS or backport policy at this time.

## Scope

MaDao is designed as an internal operations tool. Its security model assumes:

- The daemon runs on a trusted local network or behind a reverse proxy
- HTTP secret authentication protects API access; it is not designed for public internet exposure without additional layers (TLS, firewall, VPN)
- Provider API keys are stored in local TOML manifests with filesystem-level access control

## Known Limitations

- Callback delivery is fire-once with no HMAC signature verification — receivers should validate payloads independently
- Session tokens are stored in-memory and do not survive daemon restarts
- macOS desktop builds are not Apple-signed or notarized; users must clear quarantine manually
- The HTTP secret can be regenerated via API but not rotated automatically on a schedule
