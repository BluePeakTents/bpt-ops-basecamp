# Ops Base Camp — Claude Code Instructions

## About This App

Operations command center for Blue Peak Tents. Counterpart to Sales Hub (bpt-sales-app).
Covers job execution, crew scheduling, fleet management, inventory tracking, and AI ops assistance.

## Environment

| Key | Value |
|-----|-------|
| Dataverse org | orge8a4a447.crm.dynamics.com |
| Publisher prefix | `cr55d_` |
| Azure SWA | mango-moss-09b2bed0f.6.azurestaticapps.net |
| Custom domain | basecamp.bluepeaktents.com (CNAME pending) |
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
- Leader FIRST NAMES are the universal identifier everywhere
- All color from conditional formatting logic — never static fills
- CDL cascade: A→all, B→B/C/D, C→C/D, D→250/SmBox only
- OPT counts as a working day in the Days count formula
- Sub-contractors display as "Meet at Site"
- Start Time (col C) is separate from Crew Arrival Window (col D)
- Driver sheets only for non-leader CDL drivers; leaders use Production Schedule

## Dataverse Tables

### Existing (from Sales Hub)
- `cr55d_jobs` — Job records (+ new ops columns: pmassigned, crewcount, trucksneeded, crewleader, crewplanned, trucksassigned, loadlistready, jobstage)
- `cr55d_jobnotes` — Job notes (notifications source)
- `cr55d_julietickets` — JULIE tickets
- `cr55d_permits` — Permits
- `cr55d_catalogskus` — Product catalog / BOM Master
- `cr55d_aiinstructions` — AI system prompts
- `cr55d_bugreports` — Bug reports (shared with Sales Hub)
- `cr55d_stafflists` — Employee roster (+ new: licensetype, islead, phone, email)
- `cr55d_subrentals` — Sub-rental tracking
- `cr55d_jobpurchases` — Purchase requests
- `cr55d_portapottyorders` — Porta-potty orders
- `cr55d_productionschedules` / `cr55d_productionmilestones` — Production schedule data
- `cr55d_loadlists` / `cr55d_loadlistlines` — Load list data
- `cr55d_inventorys` / `cr55d_inventoryitems` — Inventory data

### Created for Ops Base Camp
- `cr55d_vehicles` — Fleet vehicle registry (80+ units from Fleet Master)
- `cr55d_notifications` — In-app notification system
- `cr55d_crewassignments` — Employee-to-job crew assignments
- `cr55d_travelbookings` — Travel bookings (flights, hotels, rental cars) linked to jobs
- `cr55d_schedulingchanges` — Audit trail for PM Capacity calendar changes (assign, move, edit)
- `cr55d_jobscheduledays` — Per-day scheduling for non-contiguous job dates
- `cr55d_holidays` — Company holidays with worker availability overrides
- `cr55d_tempworkers` — Temp staffing bookings (company, headcount, date range, cost)
- `cr55d_employeeblockouts` — Employee date blocks and recurring unavailability rules

## Architecture

### Frontend
- React 19 + Vite 8
- Single CSS file (src/styles/basecamp.css) with Blue Peak design tokens
- Components: Dashboard, Scheduling, Inventory, Fleet, OpsAdmin, AskOps, JobDrawer, NotificationPanel, WeeklyOpsView
- Data constants: src/data/crewConstants.js (58 employees, CDL logic, truck types)
- Doc generation: src/utils/generateLeaderSheet.js, generateDriverSheet.js, calendarImport.js

### API (Azure Functions)
- `/api/dataverse-proxy/{*path}` — OData proxy with entity whitelist
- `/api/claude-proxy` — Claude API with Dataverse AI instruction cache + streaming

### Reference Specs
- `/specs/` directory contains MVP reference docs (PROJECT_INSTRUCTIONS, BP_System_Summary, Production_Schedule_Reference_Guide)
