# D47 runtime evidence — 2026-06-28T20:44:13Z  (new build, port 3939, loopback)

## /api/orch/health (open) -> expect 200 + checks
{"ok":true,"version":"v0.1","uptimeMs":4809,"checks":{"vault":true,"ai":false,"flags":true,"git":true}}
HTTP 200

## /api/flags (open read) -> expect 200 list
[{"id":"telemetry","enabled":true,"description":"Local machine telemetry collector","updatedAt":""},{"id":"keystroke","enabled":false,"description":"Consent-based typing-recovery recorder (visible)","updatedAt":""},{"id":"screenshots","enabled":true,"description":"Auto screenshot capture","updatedAt":""},{"id":"autopilot","enabled":true,"description":"Autopilot suggestions/fleet","updatedAt":""},{"id":"clipboardSync","enabled":false,"description":"Cross-device E2E clipboard","updatedAt":""},{"id":"sync","enabled":false,"description":"Central command sync","updatedAt":""},{"id":"orchestrator","

## /api/orch/risk (admin) WITHOUT session -> expect 403 (authz works)
{"error":"admin only"}
HTTP 403

## POST /api/flags (admin) WITHOUT session -> expect 403 (toggle authz)
{"error":"admin only"}
HTTP 403

## /api/orch/branches (admin) WITHOUT session -> expect 403
{"error":"admin only"}
HTTP 403
