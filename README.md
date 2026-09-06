# Form — 3D Workshop

A two-panel AI chat and interactive 3D workspace with browser-local model revisions and solid-geometry comparisons.

## Run locally

Requires Node.js 22.13 or newer and pnpm.

```sh
pnpm install
cp .env.example .env # only if .env does not already exist
pnpm dev
```

Open the local URL printed in the terminal. A sample tray works without an API key. Fill in `.env` to enable actual AI chat:

```dotenv
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-6-astra
```

Use a Responses API model available to your account with structured output support. Restart the development server after changing these values. The key remains on the server; never put it in a `VITE_` or `NEXT_PUBLIC_` variable. Do not commit `.env`. The status endpoint checks configuration only; a successful chat verifies key, billing and model access.

For a hosted Sites deployment, configure `OPENAI_API_KEY` as a secret and `OPENAI_MODEL` as an environment variable through Sites. Local `.env` is not uploaded to the hosted environment. The private preview ships without credentials until configured. Do not make it public with a shared API key without adding per-user authentication and usage limits.

## Use

- Orbit by dragging, zoom with the wheel, pan with the right mouse button. Touch supports orbit and pinch zoom.
- Describe a simple part, including millimeter dimensions. Enter sends; Shift+Enter inserts a new line.
- Ask follow-up edits. The current model is included in each API request.
- The complete response is validated, geometry is compiled in a cancellable Web Worker, and then chat and model update together. Partial responses, errors and cancellation preserve the prior model.
- Export binary STL. Coordinates remain in millimeters and Z points up, independent of viewer orbit.
- Grid, wireframe and fit-to-model controls aid inspection.
- Each successful model edit creates a revision. Ordinary chat, failed generation and cancellation do not.
- Changes Comparison shows removed volume in red (before minus after), added volume in green (after minus before), and unchanged volume in gray (intersection). Gray is translucent to expose internal changes. Geometry stays in shared model coordinates; movement counts as removal and addition.
- Model Original shows only the selected revision in its normal model color. Export always uses that revision, never colored comparison solids.
- Select an earlier revision in the strip to inspect it. Editing it creates a new revision with that selected revision as its parent; comparison follows the actual parent rather than the preceding list entry.
- Model revisions are saved in browser localStorage on this device and origin, not a cloud account. Prompts attached to revisions are stored there too. Chat is session-only. Localhost and the hosted URL have separate histories. Clearing browser data deletes history.

## Scope and limitations

The first geometry language supports up to 48 sequential union/subtraction operations on boxes, elliptical cylinders and ellipsoids, with position, rotation and dimensions. This can represent trays, enclosures, basic brackets and drilled parts. It does not implement arbitrary sculpting, text, fillets, advanced CAD constraints or STEP export. Supported solid dimensions are 0.2–500 mm. Curved surfaces are tessellated.

No API key was available during implementation. Automated integration tests mock provider responses; live provider quality and account access must be verified after setup. Geometry validity is not a printability, fit or strength guarantee; inspect in a slicer and verify dimensions. History survives reloads in this browser; chat does not. No cloud sync, merging, or shared review yet. Conversation context is bounded to the latest 39 messages plus the complete current model.

## Architecture

React/Vinext + Sites (Cloudflare Worker); Three.js viewer; JSCAD solid modeling in a Web Worker; OpenAI Responses API with strict JSON schema; no AI-generated JavaScript is executed.

- `app/page.tsx`: chat and atomic model update workflow
- `app/api/chat/route.ts`: server API proxy, input validation and request timeout
- `lib/ai.ts`: provider adapter and structured response handling
- `lib/cad/`: bounded solid schema, geometry compilation, worker and STL export
- `components/model-viewer.tsx`: viewer controls and rendering

```sh
pnpm test
pnpm typecheck
pnpm build
```
