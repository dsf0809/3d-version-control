# Form — project progress

Last updated: 2026-09-10

## Current status

Stable feature identity, reviewable AI proposals and the feature inspector are
implemented locally, along with measured change explanations and clickable feature
bounds, plus a persistent project sidebar. Latest verification: 44 automated tests passed, type checking
passed, and git diff whitespace checks passed. The production build passed
with the feature inspector changes. Browser checks covered
proposal comparison, reload, accept/discard, restore, branch switching and STL
download. Live AI testing returned a usage-limit error; successful live generation
is not verified. Offline tests make no API calls and do not measure AI quality.

The implementation batch is included in the local commit checkpoint below.
The implementation is pushed to GitHub; hosted deployment remains pending and may differ from the
local app. Local database migrations have been applied.

## Completed

- [x] Responsive layout implementation: flow-based viewer controls and isolated 3D
  stage, container-aware stacked panels, mobile project navigation, wrapping toolbars
  and viewport-bounded dialogs. Seven browser sizes verified, including comparison
  and a short-window dialog; 41 offline tests, type checking and build passed.
  Changes remain local.

- [x] Independent From/To comparison selectors across all saved project revisions,
  including other branches, plus pending-proposal target and Swap. Comparison
  selection does not change the accepted revision used for editing or exports.
- [x] Modern workspace refresh: softer surfaces, compact typography, rounded
  main workspace, clearer sidebar selection, refined toolbar and review controls.
  Browser verified V0 → V1 and reversed V1 → V0 colors and measured explanations.
  41 offline tests and type checking passed; production build verified.

- [x] Organize the workspace: project navigation in the sidebar; details and
  branches in the header; Edit dimensions, Dimension locks, Export & print and
  Share revision in dedicated tool panels; chat and proposal review stay visible.
  Verified all four panels in the browser and inspected the overall layout.
  41 offline tests, type checking and production build passed (2026-09-08).

- [x] Collapsible project sidebar with search, recent ordering, creation, rename,
  archive and restore. Switching reopens saved branch, revision, chat and proposals.
  Local archive migration applied; hosted migration remains pending.

- [x] Two-panel model viewer and AI chat with configurable API integration.
- [x] Saved projects, branches, revisions, messages and durable conversation support.
- [x] Original model and red/green/gray geometry comparison views.
- [x] Built-in two-version tray demo.
- [x] Stable feature IDs, schema migration and generated-model identity validation.
- [x] Saved proposals with preview, refine, accept and discard.
- [x] Restore earlier versions through a proposal and a new accepted revision.
- [x] Authenticated STL download of saved accepted revisions.
- [x] Offline multi-turn integration test covering refinement context, persistence,
  comparison, acceptance and STL geometry; full suite now 31 passing tests.
- [x] Add this tracker and persistent instructions to maintain it.

## Next steps, in priority order

1. [x] **Editable dimensions and feature inspector.** Select a feature, display its
   dimensions and position in millimeters, and edit values through the existing
   proposal flow. Verify selection, validation, comparison, accept/discard and reload.
2. [x] **Dimension locks.** Persist per-feature locked dimensions; enforce them on
   the server for AI and manual edits. Explain conflicts without changing the
   accepted model. Test refinement, branching and restoration with locks.
3. [x] **Measured change explanations.** Show feature names and before/after values
   derived from model data. Clicking an explanation highlights the affected feature.
   Cover added, removed, moved, resized and renamed features.
4. [x] **Sharing and access controls.** Add read-only links with explicit scope,
   revocation and owner-controlled export access. Test unauthorized access and
   revocation. Decide whether links target a fixed revision or a project.
5. [x] **3MF export and slicer handoff implementation.** Export accepted geometry with millimeter
   units and supported model colors. Validate import in Bambu Studio, PrusaSlicer,
   OrcaSlicer and Creality Print; document a Cura-compatible route. Keep printer
   settings and slicing in the slicer initially. Confirm current format support
   from vendor documentation during implementation.
6. [ ] **Printing validation and customer pilot.** Print representative parts,
   check dimensions and usability, and collect feedback on the full design-to-print
   workflow. Record physical results separately from software checks.

## Release and later work

- [ ] Import exported 3MF in actual Bambu Studio, PrusaSlicer, OrcaSlicer,
  Creality Print and Cura installations and confirm dimensions and slicing.
  No slicer installations were found in /Applications during implementation.

- [ ] Browser verification of dimension lock controls, share viewer/revocation,
  and local JSON file selection. Backend integration tests pass.
- [ ] STL/3MF mesh import for use as an AI editing starting point (requires a
  mesh editing representation; the current importer accepts Form model JSON).
- [ ] Verify recipient access through the hosted Sites access policy before
  publishing sharing. No site-wide access changes have been made.

- [x] Review and commit the completed local batch (2026-09-10).
- [x] Push implementation commit b3d6193 to GitHub main (2026-09-10).
- [ ] Apply hosted migrations and deploy when requested; verify hosted workflows.
- [ ] Optional successful live AI smoke test when specifically requested and API
  quota is available. Default development verification stays offline.
- [ ] Assess direct printer integration after reliable slicer handoff and pilot feedback.

## Progress log

| Date | Step | Evidence / remaining limit |
| --- | --- | --- |
| 2026-09-07 | Stable IDs and proposal review implemented locally | Automated tests, type checking, build and browser verification; live API quota blocked |
| 2026-09-07 | Offline conversation test added | 31 tests passed; context, refinement, comparison, acceptance and STL checked without API calls |
| 2026-09-07 | Progress tracker added | Next action: implement editable dimensions and feature inspector |
| 2026-09-07 | Feature inspector implemented | 32 offline tests, type checking and production build passed; browser feature selection, manual proposal comparison and reload verified. Select features by name; edits of historical revisions require restoring or branching first. Next: dimension locks. |
| 2026-09-07 | Measured change explanations implemented | 34 offline tests and type checking passed. Added/removed/moved/resized/renamed features have model-derived details and clickable red/green oriented bounds. Bounds identify source primitives, not exact Boolean surface ownership. Browser interaction verification of the new highlights remains a release check. Dimension locks intentionally remain pending. |

Update this file after every completed meaningful step, recording checks and any
remaining limitations. A checked item means its stated scope is complete, not
that it has been deployed or physically printed.

### 2026-09-07 — Project sidebar completed

35 offline tests, type checking and production build passed. Browser checks passed
for creation, archive/restore, rename, search, collapse persistence after reload,
and switching back to the demo's Branch 2 with its V2 pending proposal intact.
No AI API calls were made. The recoverable `Sidebar QA — verified` project remains
as test data. Next implementation priority: dimension locks. Changes remain local.

### 2026-09-08 — Locks, sharing and JSON import

39 offline tests passed. Type checking and the production build passed; local
migration 0003 applied. Locks apply project-wide, including branches, AI/manual
proposals, acceptance and restoration. Read-only links target a fixed accepted
revision, store hashed tokens, support revocation and enforce STL export permission.
Links expose model data only, not discussion or project notes. Download restrictions
are not DRM, and revocation cannot erase copies already obtained.

The sidebar imports a Form model JSON file into a new project as V0. Owners can
download accepted model JSON from Dimension locks & sharing for re-import.
Invalid/oversized JSON is rejected; import does not execute code. Offline tests
confirm the imported model becomes AI context. STL/3MF import is still pending.
No paid API calls, commit/push, hosted migration, or deployment were performed.

### 2026-09-08 — 3MF export and slicer handoff

Implemented owner-authenticated 3MF downloads for selected accepted revisions,
an STL/3MF format selector, and an in-app slicer guide with official links.
The Core 3MF OPC package stores millimeter units, welded vertex indices, original
triangle winding, model name and the viewer's single blue display material.
It contains no chat, printer profiles, AMS mapping or G-code. Downloading from a
proposal view still exports the accepted revision. Share links retain their
existing permission-controlled STL download behavior.

41 offline tests and type checking passed. Independent Python zipfile CRC and
ElementTree XML parsing passed on a generated tray archive. Exact triangle
coordinates round-trip in tests. Actual slicer import and physical printing are
pending; display color may be replaced by the slicer's filament color.


### 2026-09-09 — Responsive workspace verified

Moved viewer controls into normal document flow around a dedicated resizing 3D
stage. Workspace panels stack based on the studio container width; toolbars wrap,
mobile project navigation uses the full width and starts collapsed on phone loads,
and dialogs are bounded by the dynamic viewport with internal scrolling.

41 offline tests, type checking, production build and diff whitespace checks passed.
Browser measurements for original and comparison views passed at 320x640, 390x844,
768x1024, 1024x768, 1440x900, 1920x1080 and 844x390: no page-wide horizontal overflow
and a usable canvas area. Inspected phone and desktop comparison screenshots with
saved tray geometry. AI settings dialog fits the short landscape viewport and scrolls.
No paid AI calls were made. Physical-device keyboards and other browser engines
remain unverified. No commit, push or deployment performed. Next: remaining release
checks above and choose a product name before changing branding.

### 2026-09-09 — Laptop comparison layout

Adjusted laptop-sized windows to keep a viewport-height workbench, a flexible
canvas and compact controls, with revision history directly below the model.
Chat remains alongside the model. Browser checks passed at 1280x700, 1280x800,
1440x800 and 1024x650 with loaded revisions: comparison selectors and the full
revision row are visible, with zero viewer scrolling and no horizontal page
overflow. Build passed. No paid API calls or deployment; changes local.

### 2026-09-09 — Focus model

Implemented a Focus model / Show controls toggle. Hides comparison, history and
export bars to expand the canvas without remounting the viewer or changing selected
versions. Browser toggle/restore checks passed at 1280x700 and 390x844: canvas
height increased from 199 to 496 px on the laptop and 260 to 546 px on mobile;
version selections were unchanged and the same canvas stayed mounted. Camera
pose was preserved, but the initial implementation still changed the apparent
model scale as canvas height changed; corrected below. Production build
and whitespace checks passed. No paid AI calls; changes remain local.

### 2026-09-09 — Focus projection correction

Compensate camera projection zoom when viewport height changes so model pixel
scale stays stable without moving the camera. Fit model now accounts for the
effective field of view. Two regression tests pass: projected scale after user
zoom and ten toggle cycles, plus fitting after resize in a narrow viewport.
Production build passed. Browser focus/restore checks passed at 1280x700 and
390x844 with unchanged selections and the same viewer instance. Projected pixel
scale verified by regression tests. Changes local; no paid AI calls.

### 2026-09-09 — Focus screen-center anchoring

Added projection offset compensation for the changing canvas origin as focus
controls disappear. Keeps the model at the same panel-relative screen position,
with unchanged camera pose and apparent scale. Three camera regression tests pass,
including absolute projected positions over ten focus/restore cycles. Production
build passed. Browser screenshots at 1280x700 show identical colored model bounds
(554,387)-(657,476) and 3963 colored pixels before, focused and restored.
No paid AI calls or deployment; changes local.

### 2026-09-09 — Fullscreen viewer

Added native fullscreen and exit controls to the model toolbar, with browser
Escape support, availability detection and a nonblocking failure message.
Fullscreen expands the 3D stage; viewer and version state remain mounted.
Browser checks passed for native fullscreen entry and exit in both normal and
focus views at 1280x700; the stage fills the viewport, selections persist and
the canvas remains mounted. Type checking, production build and whitespace
checks passed. Escape uses native browser behavior; not separately automated.
Changes local; no paid AI calls or deployment.

### 2026-09-10 — Local commit checkpoint

Included the completed project/proposal workflows, feature edits and locks,
sharing and exports, responsive comparison UI, camera anchoring and fullscreen.
44 offline tests and whitespace checks passed; latest production build and
type checking passed. Secret-pattern scan found no matches; local environment
and database files remain ignored. Per-feature colors have not been implemented.
This checkpoint records a local commit only; push and deployment remain pending.

### 2026-09-10 — GitHub push

Pushed implementation commit b3d6193 to origin/main successfully. This follow-up
records the completed push; hosted migrations and deployment remain pending.

### 2026-09-10 — README launch preparation

Reorganized README around inspectable AI changes, the no-key saved demo, setup,
review/export workflow, current features and explicit limitations. Added focus/
fullscreen controls, per-part color limitation, feedback guidance, architecture,
validation and deployment status. Corrected stale comparison and tool locations.
No demo media or license was invented. Verified README links to local files, package-script names, balanced code fences,
license-file absence and diff whitespace. No runtime changes or AI calls; no
application tests rerun for this documentation-only update. Not committed or pushed.

### 2026-09-10 — MIT license and documentation commit

Added the standard MIT license with copyright 2026 dusifei, linked it from the
README and declared MIT in package metadata. Included the README launch rewrite
in this local commit. Verified local documentation links, package JSON and diff
whitespace. No runtime changes, AI calls or deployment; this commit is not pushed.

### 2026-09-10 — License and README published to GitHub

Successfully pushed c5a981b (MIT license and README update) to origin/main.
This tracker update accompanies the push. Hosted deployment remains pending.
