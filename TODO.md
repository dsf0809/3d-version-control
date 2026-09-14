# Form — project progress

Last updated: 2026-09-13

## Current status

The architecture roadmap and Git-style team contribution implementation are now
implemented locally. Owners invite editors/viewers, contributors edit their own
branches, and merges use common ancestry, explicit conflict choices and the existing
proposal approval flow. Main and project settings are owner-controlled. This is
asynchronous collaboration, not simultaneous co-editing or external Git sync.

76 offline tests passed. Browser checks passed for invitations/revocation, color
proposals, branches, reviewed merges, lazy comparison models, 3MF colors, source
picking and seven window sizes. Camera/idle-rendering, templates, mocked reload
recovery and message paging also passed. The isolated compiled-worker smoke test
passed alarm/RPC execution, deduplication and model proposal acceptance with two
locally intercepted mock requests and zero external requests.

Final type checking, production build and whitespace checks passed after UI polish.
Successful live AI quality,
actual slicer imports, physical printing and hosted multi-account authentication
remain release checks. The existing large-bundle warning remains.

All changes are local and uncommitted. Local migrations 0004–0006 are applied;
GitHub and the hosted site do not include this batch. No paid AI calls or deployment.

## Architecture improvements (approved 2026-09-12)

1. [x] Geometry reuse: bounded model/comparison cache, persistent worker pool,
   cancellation and server solid reuse. Verified locally: shared-job cancellation,
   worker replacement, queue limit, timeout, cache eviction and reuse.
2. [x] Targeted AI edits with server validation and a project-level choice of
   review before applying (default) or automatically apply validated new edits.
   Existing proposals still require review. Verified locally: targeted edits,
   full-model fallback, locks, stale base rejection, owner permissions, idempotent
   auto-save, cancellation/expired lease guards and proposal refinement.
   Migration 0004 applied locally; hosted migration pending.
3. [x] Separate editing, comparison and viewer state; independent browsing per tab.
   Scoped read-only navigation returns the correct branch discussion and proposals.
   Editing selection persists in session storage per tab; comparison and viewer
   controls have separate reducer state per project. Comparison selection survives
   editing-revision changes. Stale loads cannot replace newer navigation.
   60 offline tests, type checking and build passed; two-tab revision/reload and
   comparison preservation browser checks passed with zero navigation writes or AI calls.
   Independent branch switching also passed in two tabs. Local and uncommitted.
4. [x] Preserve camera through geometry changes; explicit Fit and demand rendering.
   Verified locally: camera pose/projection stable within floating-point tolerance
   across geometry/comparison changes, explicit Fit works, and idle draw calls stop.
   Render scheduler regression covers frame coalescing, settling and disposal.
5. [x] Durable generation jobs with reconnect, recovery and clear progress.
   Durable Object alarm execution continues independently of the browser. Saved
   phases, cancellation, completed-result deduplication and interrupted-job handling
   are tested; uncertain paid requests are never automatically replayed.
6. [x] Paginate project history and load revision geometry on demand.
   40-item revision metadata/message pages, one selected model per snapshot, lazy
   comparison model fetches and bounded client model retention. Cursor coverage tested.
7. [x] Richer parameters, relationships, templates, feature colors and surface picking.
   Validated starting templates, linear dimension links with cycle/lock checks,
   feature colors through proposals and 3MF, and picking in original view. General
   CAD constraint solving and arbitrary mesh editing remain outside this scope.
8. [x] Split workshop/store modules, consolidate CSS and expand responsive regressions.
   Workspace model/chat panels, orchestration hook, turn transactions, shared store
   helpers and viewer engine extracted. Workspace/responsive CSS separated while
   preserving cascade order. Seven window sizes and integrated flows verified.

## Team collaboration

- [x] Owner/editor/viewer access; single-use, expiring, revocable invitations.
- [x] Shared project listing and contributor-owned branches; protected Main/settings.
- [x] Three-way merges with explicit conflicts, proposal review and merge-parent history.
- [x] Author attribution and revoked-access guards for queued/in-flight changes.
- [x] Team controls in project details; branch refresh and merge controls in the header.
- [ ] Hosted verification with separate real accounts and recipient access policy.
- [ ] Later enhancements: team display names, comments, notifications and live presence.

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

### 2026-09-12 — Independent workspace navigation

Architecture item 3 implemented locally. Project/branch/revision browsing now uses
scoped GET requests instead of changing the shared saved selection. Tabs remember
their editing target independently. Branch-specific discussion and proposals are
returned together; server validation rejects foreign branch/revision combinations.
Presentation state has separate comparison and viewer reducer actions; choosing
a comparison does not change the editing/export target. The chat heading names
the editing revision. No new migration or paid AI test. Changes uncommitted.

Final item-3 verification: 60 offline tests, type checking and production build
passed. Two tabs independently selected revisions and branches and retained them
on reload. Comparison pairs survived editing-revision changes. Navigation emitted
zero PATCH selection writes, with zero browser errors and zero AI calls. Next:
architecture item 4, camera preservation through geometry changes and demand rendering.

### 2026-09-12 — Remaining architecture implementation batch

Implemented camera preservation and demand rendering; extracted the Three.js
engine and render scheduler from the React controls. Extracted chat orchestration
from project navigation and added separate message paging and turn-status services.
Added persisted generation phases and tab reload recovery (no automatic paid retry),
40-message pages, and tray/enclosure/L-bracket starting templates with validated
parameters in the existing new-project form. Extra dimensions remain collapsed.

65 offline tests and type checking passed. Migration 0005 applied locally. Browser
checks passed at 1280×720 and 390×844 for template creation, mocked request
recovery, history paging and layout; no browser errors or paid API calls. Production
build passed with the existing large-bundle warning. Item 4 is implemented; items 5–8
remain partial: background queue execution, lazy revision models, feature
relationships/colors/picking, and broader module/CSS consolidation are still open.
Collaboration review: single-owner projects and fixed-revision read-only shares
only; no teammate roles, invitations, comments or shared editing. Not deployed.

### 2026-09-12 — Architecture completion and collaboration in progress

Background Durable Object jobs, lazy revision model loading, feature relationships,
colors/picking, and workspace/store decomposition are implemented locally. 72 offline
tests, type checking and build passed; integrated browser verification remains pending.
Adding invited viewer/editor membership, protected contributor branches and reviewed
three-way merges. No paid AI calls, commit, or hosted deployment in this batch.

### 2026-09-13 — Resumed verification

Folder access restored. Fixed the hidden Appearance & dimension links heading
caused by the older dialog CSS. Collaboration backend has 76 passing offline tests;
local migration 0006 is applied. Completing integrated browser checks before marking
the architecture items complete. No live paid AI test or deployment.

### 2026-09-13 — Architecture and team integration verified

76 offline tests cover roles, invitations, protected branches, merge attribution,
conflict choices and revocation during generation, alongside existing behavior.
Browser checks passed invitations/revocation, color and dimension proposals, branch
creation and reviewed merge, lazy comparisons, colored 3MF and surface picking at
1920×1080, 1440×900, 1280×720, 1024×768, 768×1024, 390×844 and 320×568.
No browser errors or AI calls. A narrow-header polish prevents clipped project
buttons. Appearance controls are accessible after fixing the legacy hidden summary.

The production Durable Object ran in an isolated Miniflare test with a fresh DB,
fake credentials and locally intercepted outbound responses. Alarm/RPC, idempotence
and acceptance of a changed/colorized model passed. The live-endpoint smoke test
was rejected by automatic approval review due to possible paid usage; the isolated
offline test replaces it. Hosted migration/deployment and real-account validation
remain pending. No commit, push or deployment.

Final verification: 76/76 offline tests, type checking, production build and
`git diff --check` passed. The final compiled-worker smoke test passed again with
zero external requests. Mobile project buttons are readable at 320/390 px and the
team dialog fits. Existing bundle-size warning remains. Some QA projects from
interrupted browser runs remain: automatic approval review rejected name-based
bulk archiving because it could include pre-existing records. No cleanup bypass
was attempted. Local website restarted on port 3000; changes remain uncommitted.

### 2026-09-13 — Private collaboration testing site published

Deployment succeeded: https://form-collaboration-staging.dsf0809.chatgpt.site
Separate staging checkout: /Users/dusifei/Documents/Codex/form-collaboration-staging
Site: appgprj_6aa65784be5c81919bd1914abfa2cef1
Source commit: cffec56a9f135b41e418b0171567e63ef6dbd223

Confirmed the deployed DB contains all nine application tables, including project
members and invitations. The staging source passed 76 offline tests, type checking
and production build. No local model records or API credentials were copied; use
manual dimension/color edits for cost-free collaboration tests. The original Site
and GitHub repository were not deployed or pushed in this staging operation.

Access remains owner-private. External tester invitations are supported, but no
tester emails or authorization to send invitations have been provided. Remaining:
allow identified testers into the private Site, then run the two-account project
invitation → contributor branch → reviewed merge acceptance test in STAGING.md.
Hosted end-to-end multi-account behavior and hosted AI jobs are not yet verified.

### 2026-09-13 — Friendly AI connection setup

Replaced environment-file-first instructions with plain-language status, teammate
guidance, an optional website-owner walkthrough and collapsed technical details.
Status distinguishes a saved key from verified AI access; refreshing never makes
an AI request. Local and hosted setup instructions are shown separately. UI and
type checking and production build passed. Browser checks passed for missing-key,
key-added and error states at 1280/390/320 px, with zero AI calls. Staging publication pending.

AI Connection update published successfully to the private staging site on
2026-09-13 (Sites version 2, commit 14522ec0619f368946d2ed70b9c6f3438f51d5c9).
The same UI changes are saved locally in the original project; GitHub/main Site
were not pushed or deployed. No secrets were changed and no AI calls were made.

## Draft-first AI behavior — 2026-09-13

- [x] Added a reusable draft-first design skill to every AI request, including durable conversations. Missing optional dimensions use explained defaults; follow-up dimensions refine the draft. Information-only questions and genuinely blocking requirements remain clarification cases. Review/auto-apply, locks and validation are preserved.
- [x] Verified 78 offline tests, including draft-skill delivery in standalone/durable requests, review/auto instructions, explanation preservation, targeted dimension refinement and question-only responses. Type checking, production build and whitespace checks passed. Mock tests verify integration, not live model compliance. No paid API calls.
- [x] Published draft-first instructions to private collaboration staging (version 3). Real AI behavior remains unverified without a paid call.

## Comparison visibility — 2026-09-13

- [x] Added independent Removed/Added/Unchanged toggles inside the canvas, including focus/fullscreen. Hidden layers and their highlight outlines are invisible. Choices survive comparison changes and original-view switching; original model colors are unaffected. Visibility changes reuse geometry and preserve the camera.
- [x] All 79 offline tests passed, including all eight visibility combinations, highlight hiding, replacement layers and unchanged geometry references. Type checking and production build passed; existing bundle-size warning remains. Browser interaction was not re-tested in this batch.
- [x] Combined update published successfully to private collaboration staging, version 3, commit 8fe6cdfe5acbf0536f41334cd62651995a860b6c, on 2026-09-13. Original local source is updated; GitHub and the original hosted site were not pushed. No API calls or secrets changes.

## Compact phone and half-screen workspace
- [x] Below 1000px, show Model/Chat switching and collapse secondary project/design actions behind Project & tools. Keep both panels mounted, preserve desktop side-by-side layout, reduce header spacing and retain comparison controls.
- [x] Type checking and production build passed. Project navigation defaults collapsed below 1000px.
- [x] Published privately to staging version 4, commit 7d5d759f04d1bf45380e57b953603c02567d4869. Original local checkout also updated.
- [ ] Browser interaction verification of the compact layout remains pending. No paid AI calls.

## Change details in the viewer
- [x] Renamed and moved the read-only feature log from chat to a toggle below Grid/Wireframe. Starts closed, comparison-only, scrollable overlay with close/Escape, phone bottom sheet, and existing highlighting.
- [x] Type checking, build and whitespace checks passed. Published private staging version 5, commit a7a4deed9835002d7702a61b64f24518ffaddbce. Both local checkouts updated.
- [ ] Browser interaction verification of the Change details panel. No paid API calls.

- [x] Change entry titles now match detail text at 12px, with bold weight. Build passed; private staging version 6 published successfully.

## GitHub checkpoint
- [x] Committed and pushed the architecture, collaboration and latest responsive viewer updates to GitHub main as ed2b13e. All 79 offline tests and whitespace checks passed; secret-pattern scan found no matches. No paid API calls or new site deployment in this step.
