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
- The server validates each complete response and its solid geometry before saving chat, revision and comparison summary in one database transaction. The browser compiles the saved model in a cancellable Web Worker before displaying it. Cancellation prevents a pending response from committing; if it already finished, the app restores the saved result.
- Export binary STL. Coordinates remain in millimeters and Z points up, independent of viewer orbit.
- Grid, wireframe and fit-to-model controls aid inspection.
- Each successful model edit creates a revision. Ordinary chat, failed generation and cancellation do not.
- Changes Comparison shows removed volume in red (before minus after), added volume in green (after minus before), and unchanged volume in gray (intersection). Gray is translucent to expose internal changes. Geometry stays in shared model coordinates; movement counts as removal and addition.
- Model Original shows only the selected revision in its normal model color. Export always uses that revision, never colored comparison solids.
- Select an earlier revision to inspect it. Sending a message from that revision starts a new branch with context through that point. Use **New branch** to branch explicitly. Comparison follows the actual parent, even when version numbers skip.
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

## Database changes

After changing `db/schema.ts`, run `pnpm db:generate`, inspect the generated SQL, then run `pnpm db:migrate` locally. Keep previously applied migrations immutable. The Sites build copies migrations to `dist/.openai/drizzle` for a future hosted deployment. Never include `.wrangler/state` or `.env` in deployment archives.
