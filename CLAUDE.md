# Ops Base Camp — Claude Code Instructions

## About This App

Operations command center for Blue Peak Tents. Counterpart to Sales Hub (bpt-sales-app).
Covers job execution, crew scheduling, fleet management, inventory tracking, and AI ops assistance.

## Environment

| Key | Value |
|-----|-------|
| Dataverse org | orge8a4a447.crm.dynamics.com |
| Publisher prefix | `cr55d_` |
| Azure SWA | TBD (basecamp.bluepeaktents.com) |
| Resource group | ops-dashboards |
| Repo | BluePeakTents/bpt-ops-basecamp |
| Branch | main |

## Git Workflow

- Always `git pull` before making any changes
- Commit and push after completing changes
- Multiple developers may push — pull first to avoid conflicts

## Key Principles

- Mirror Sales Hub design language exactly
- Dataverse schema changes require user confirmation before executing
- All AI prompts live in cr55d_aiinstructions table (not hardcoded)
- App informs SharePoint (not the reverse)
- 2026+ data only — no pre-2026 backfill
