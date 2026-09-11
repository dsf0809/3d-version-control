# Form — 3D Workshop

A two-panel AI chat and interactive 3D workspace with durable projects, saved conversations, model branches, and solid-geometry comparisons.

## Run locally

Requires Node.js 22.13 or newer and pnpm.

```sh
pnpm install
cp .env.example .env # only if .env does not already exist
pnpm db:migrate
pnpm dev
```

Open the local URL printed in the terminal and choose **Continue to your workshop**. Local development uses the Sites plugin’s fixed test identity; hosted private Sites use the signed-in user. A sample tray works without an API key. Fill in `.env` to enable actual AI chat:

```dotenv
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-6-astra
```

Use a Responses API model available to your account with structured output support. Restart the development server after changing these values. The key remains on the server; never put it in a `VITE_` or `NEXT_PUBLIC_` variable. Do not commit `.env`. The status endpoint checks configuration only; a successful chat verifies key, billing and model access.

For a hosted Sites deployment, configure `OPENAI_API_KEY` as a secret and `OPENAI_MODEL` as an environment variable through Sites. Local `.env` is not uploaded to the hosted environment. The private preview ships without credentials until configured. Do not make it public with a shared API key without adding per-user authentication and usage limits.

## Use

- Every workspace includes **Demo — tray comparison**, with two saved versions and no API key required. V0 has the divider on the right; V1 moves it left. Open the demo from the project picker and select **Changes Comparison** to see red removal, green addition, and gray unchanged material. The demo is included in the source and created once per user; reopening it preserves your edits.

- Orbit by dragging, zoom with the wheel, pan with the right mouse button. Touch supports orbit and pinch zoom.
- Describe a simple part, including millimeter dimensions. Enter sends; Shift+Enter inserts a new line.
- Use the project name in the header to create or reopen projects and edit the design brief and requirements. Those details and the exact selected model are included in every AI request.
- Each branch creates an OpenAI Conversation on its first chat, then reuses it across reloads. Switching branches restores that branch’s discussion.
- The server validates complete responses and solid geometry before saving a proposal and its chat in one transaction. The accepted model stays unchanged until **Accept changes**. **Discard** preserves it, and **Refine** continues from the pending proposal. Pending proposals survive reloads. A failed or cancelled refinement preserves the previous proposal.
- Export binary STL. Coordinates remain in millimeters and Z points up, independent of viewer orbit.
- Grid, wireframe and fit-to-model controls aid inspection.
- Accepting a proposal creates one revision. Repeated acceptance is idempotent; stale proposals cannot overwrite a changed branch. Review decisions are included in subsequent AI context.
- Changes Comparison shows removed volume in red (before minus after), added volume in green (after minus before), and unchanged volume in gray (intersection). Gray is translucent to expose internal changes. Geometry stays in shared model coordinates; movement counts as removal and addition.
- Model Original displays the proposed model when reviewing, or the selected accepted revision otherwise. **Show accepted model** toggles between them. Changes Comparison compares a proposal with its accepted base. Export always downloads the selected accepted revision through an authenticated endpoint, never the proposal or colored comparison solids.
- Select an earlier revision to inspect it. Sending a message from that revision starts a new branch with context through that point. Use **New branch** to branch explicitly. Comparison follows the actual parent, even when version numbers skip.
- **Restore this version** prepares an older model as a proposal on the branch head. Accept it to create a new revision while preserving history.
- Model schema v2 adds persistent feature IDs. Existing snapshots are upgraded on load without changing geometry. Legacy IDs are derived from feature names and types; historical renames or ambiguous duplicate features cannot always be identified perfectly. New AI models must include unique IDs and preserve existing feature identities.
- Refer to a saved version by its label, such as “Use V2 dimensions,” to include that exact model in the request.
- Projects, model snapshots, chat, and branch conversation identifiers are stored in D1. Local development persists the database in `.wrangler/state/v3/d1`; hosted deployment uses a separate managed database. Browser storage only keeps the last-opened project preference and an untouched legacy backup. Clearing browser storage does not delete saved projects.
- Existing browser revisions are imported once per owner and history fingerprint (up to 200 revisions). The original backup is preserved. The previous app did not save chat, so earlier chat cannot be recovered.

## Scope and limitations

The first geometry language supports up to 48 sequential union/subtraction operations on boxes, elliptical cylinders and ellipsoids, with position, rotation and dimensions. This can represent trays, enclosures, basic brackets and drilled parts. It does not implement arbitrary sculpting, text, fillets, advanced CAD constraints or STEP export. Supported solid dimensions are 0.2–500 mm. Curved surfaces are tessellated.

Automated integration tests use a real SQLite database with mocked OpenAI responses. They cover ownership, persistence, conversation reuse, idempotency, branching, cancellation, expired locks, and invalid geometry. Live model quality and account access are separate from those tests. Geometry validity is not a printability, fit or strength guarantee; inspect in a slicer and verify dimensions.

There is no branch merging, shared editing, project deletion, automatic conversation compaction, or local-to-hosted data sync yet. Long conversations remain subject to the model’s context and token limits. A new or recovered conversation is seeded with project requirements, revision summaries, the exact selected model, explicitly referenced versions, and the latest 40 saved messages. Failed or cancelled requests discard their conversation association so the next turn reconstructs context from committed state. This does not delete the abandoned conversation from OpenAI.

The database is the authoritative model archive; an OpenAI Conversation is a context aid. Durable conversations store project context at OpenAI. See [OpenAI conversation-state documentation](https://developers.openai.com/api/docs/guides/conversation-state). Local data survives app restarts while `.wrangler/state` remains intact. Back up that directory with the server stopped before moving or cleaning the project.

## Architecture

React/Vinext + Sites (Cloudflare Worker); Three.js viewer; JSCAD solid modeling in a Web Worker; OpenAI Responses API with strict JSON schema; no AI-generated JavaScript is executed.

- `app/page.tsx`: signed-in workshop entry
- `components/workshop.tsx`: two-panel UI and geometry comparison
- `components/project-controls.tsx`: project details and branch controls
- `lib/projects/`: client state, owned database queries, turn locking, and durable conversation orchestration
- `db/schema.ts` and `drizzle/`: schema and generated migrations
- `app/api/chat/route.ts`: server API proxy, input validation and request timeout
- `lib/ai.ts`: provider adapter and structured response handling
- `lib/cad/`: bounded solid schema, geometry compilation, worker and STL export
- `components/model-viewer.tsx`: viewer controls and rendering

```sh
pnpm test
pnpm typecheck
pnpm build
```

The automated tests use injected local provider responses and an isolated SQLite
database. They require no API key and make no paid API calls. The offline
conversation scenario exercises proposal generation, refinement with a reused
conversation ID, reload, three-way geometry comparison, acceptance, STL output,
and rebuilding context from the accepted model. Run just this scenario with:

```sh
node --import tsx --test --test-name-pattern='offline conversation' tests/projects.test.ts
```

This checks application integration with deterministic model responses; it does
not measure the real model's design quality or verify provider credentials and
availability. The interactive app continues to use the configured real provider.

## Database changes

### 3MF and slicer handoff

Choose **3MF (mm + color)** beside the viewer's export button, or choose STL as a
fallback. Exports use the selected accepted revision even while reviewing a
proposal. **Open in your slicer** in the chat panel explains model import and
the remaining slicing steps. These are model files, not ready-to-print jobs.

The exporter follows the [3MF Core specification](https://github.com/3MFConsortium/spec_core/blob/master/3MF%20Core%20Specification.md).
The archive contains millimeter geometry and one display material matching the
viewer. Printer settings, supports, G-code and multi-material assignments are
configured in the slicer. Use your printer's normal slicer send/export workflow.
No direct printer connection or application launch is performed.

Reference import documentation: [Bambu Studio](https://github.com/bambulab/BambuStudio/wiki),
[PrusaSlicer](https://help.prusa3d.com/article/supported-file-formats_1772),
[OrcaSlicer](https://github.com/OrcaSlicer/OrcaSlicer/wiki/import_export),
[Creality Print](https://wiki.creality.com/en/software/6-0/Quick-Start), and
[Cura](https://ultimaker.com/learn/ultimaker-cura-5-7-stable-release-notes/).
Actual import testing across these applications remains pending.

Use the workspace toolbar for **Edit dimensions**, **Dimension locks**,
**Export & print**, and **Share revision**. Export & print groups STL, 3MF and
editable JSON downloads with slicer instructions. Project details and branches
are in the header; search, import and archiving are in the project sidebar.
Locks apply to the whole project across branches. Share links are fixed
accepted-revision snapshots; owners can revoke them and disable STL downloads.
Shared geometry is necessarily sent to the viewer, so disabled downloads are not
copy protection. Hosted Sites access policies must also permit the intended
recipient; this feature does not change the site's deployment access policy.

Use **Import model JSON** in the sidebar to start a project from a local Form model
(maximum 1 MB). Use **Download editable model JSON** to export an accepted revision
for this purpose. The file must contain the supported model name and primitive
operations; arbitrary CAD scripts, STL and 3MF files are not accepted yet.

After changing `db/schema.ts`, run `pnpm db:generate`, inspect the generated SQL, then run `pnpm db:migrate` locally. Keep previously applied migrations immutable. The Sites build copies migrations to `dist/.openai/drizzle` for a future hosted deployment. Never include `.wrangler/state` or `.env` in deployment archives.
