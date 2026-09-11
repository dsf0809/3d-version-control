# Form — 3D Workshop

**Describe a part. Inspect every change. Keep the versions that work.**

Form is an AI-assisted workspace for functional 3D-printed parts. Chat beside an
interactive model, preview proposed edits, and compare saved versions before
accepting a change. Removed geometry is **red**, added geometry is **green**, and
unchanged geometry is **gray**.

Use it to explore trays, enclosures, simple brackets, and other parts built from
basic solids. Start with the included tray demo—no API key needed.

> **Development preview:** the core workflows are implemented and covered by
> offline tests. Successful live AI generation, cross-slicer import validation,
> and physical printing validation remain release checks. See [TODO.md](TODO.md)
> for current progress and outstanding work.

## Try the comparison demo

After starting the app locally:

1. Choose **Continue to your workshop**.
2. Open **Demo — tray comparison** from the project sidebar.
3. Select **Changes Comparison** and compare **V0 → V1**. The tray divider moves
   from right to left; red and green show its old and new locations.
4. Use **From**, **To**, and **Swap** to inspect versions in either direction.
5. Switch to **Model Original** to see the model without comparison colors.
6. Use **Export & print** to download an accepted revision for your slicer.

The demo contains saved models; it does not simulate a live AI response. It is
created once per user, and reopening it preserves subsequent edits.

## What you can do

| Capability | How it helps |
| --- | --- |
| AI proposals | Describe an edit, inspect the result, then accept, refine, or discard it |
| Version comparison | Compare any two saved project revisions, including across branches, or preview a pending proposal |
| Saved projects and branches | Return to earlier designs with their conversation and revision history |
| Manual feature edits | Adjust dimensions and position without an AI request |
| Dimension locks | Protect selected feature dimensions across AI edits, manual edits, branches, and restoration |
| Measured changes | Read before/after values and highlight the affected feature bounds |
| Focus and fullscreen | Expand the model view while inspecting details; focus toggling preserves model scale and screen position |
| Editable JSON import | Start a new project from a previously exported Form model |
| STL and 3MF export | Download accepted geometry in millimeters for slicer preparation |
| Read-only sharing | Share a fixed accepted revision, revoke its link, and control the STL download option |

Projects can be searched, renamed, archived, and restored from the sidebar.
The layout adapts to desktop, laptop, and narrower windows.

## Run locally

**Requirements:** Node.js 22.13 or newer and pnpm.

```sh
git clone https://github.com/dsf0809/3d-version-control.git form-3d-workshop
cd form-3d-workshop
pnpm install
# Preserve an existing local configuration.
test -f .env || cp .env.example .env
pnpm db:migrate
pnpm dev
```

Open the URL printed in the terminal, normally `http://localhost:3000`, and choose
**Continue to your workshop**. Local sign-in uses the Sites plugin's fixed test
identity; it is intended for development.

You can explore the demo, compare versions, edit features manually, and export
models without configuring an AI key.

### Enable AI chat

Set these values in your local `.env` file:

```dotenv
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-6-astra
```

`OPENAI_MODEL` is configurable. Use a model available to your API account that
supports the Responses API and structured outputs. Restart the development server
after changing the file.

The key stays on the server. Keep `.env` out of Git and never put the key in a
`VITE_` or `NEXT_PUBLIC_` variable. The connection indicator checks configuration;
it does not verify credentials, quota, or successful generation. Sending a real
chat request uses your API account and may incur charges.

Try a specific request such as:

> Move the tray divider 10 mm to the left. Keep the outer dimensions unchanged.

## Design, review, and print

1. **Create or import a project.** Add a brief and requirements in project details,
   or use **Import model JSON** in the sidebar. Imports accept Form model JSON up
   to 1 MB, not STL, 3MF, or arbitrary CAD scripts.
2. **Request or make an edit.** Chat with the assistant or use **Edit dimensions**.
   AI responses and resulting geometry are validated before a proposal is saved.
3. **Review the proposal.** Use the comparison and measured changes. The accepted
   design stays unchanged until you choose **Accept changes**. Pending proposals
   survive reloads; failed or cancelled refinements preserve the previous proposal.
4. **Save or revisit a version.** Acceptance creates a revision. Inspect earlier
   revisions, create branches, or use **Restore this version** to prepare a new
   proposal from an older design without deleting history.
5. **Export an accepted revision.** Open **Export & print** and choose a format.
   Viewing a proposal or selecting a comparison pair does not make that proposal
   or comparison geometry the export target.
6. **Prepare the print in your slicer.** Choose the printer and filament, check
   scale and orientation, add supports if needed, inspect the toolpath, and use
   the slicer's normal print workflow.

| Format | Contents |
| --- | --- |
| 3MF | Millimeter geometry and one blue display material matching the original-model viewer |
| STL | Binary triangle geometry; coordinates use millimeters, with Z up |
| Form JSON | Editable model operations for re-import and further editing |

The in-app handoff guide covers Bambu Studio, PrusaSlicer, OrcaSlicer, Creality
Print, and a Cura-compatible route. Actual import testing across those slicers is
still pending. Exports do not contain printer profiles, supports, G-code, or
multi-material assignments. Form does not launch a slicer or connect to a printer.

**Viewer controls:** drag to orbit, scroll to zoom, and right-drag to pan. Touch
supports orbit and pinch zoom. The toolbar includes fit, grid, wireframe, and
fullscreen controls. **Focus model** hides comparison and history bars;
**Show controls** restores them. In chat, Enter sends and Shift+Enter adds a line.

## Current limits

- **Bounded geometry:** up to 48 sequential additions/subtractions using boxes,
  elliptical cylinders, and ellipsoids. Feature dimensions range from 0.2–500 mm;
  curved surfaces are tessellated.
- **No arbitrary sculpting or advanced CAD features:** fillets, text, STEP export,
  and general constraint solving are not implemented.
- **No per-part colors yet:** the original model uses one blue material. An API
  request such as “make the divider white” cannot currently change its color.
- **No STL/3MF mesh import:** the editable import route accepts Form JSON only.
- **No branch merging, shared editing, or project deletion:** archiving is
  available. Local and hosted databases do not synchronize automatically.
- **Comparisons measure geometry:** moving a part appears as removal and addition.
  Feature highlights outline source primitives, not exact ownership of every
  Boolean surface. Legacy feature matching can be ambiguous after renames.
- **Printing still needs verification:** valid geometry does not establish
  printability, fit, or strength. Physical test prints remain part of the roadmap.

## Data, conversations, and sharing

Projects, model snapshots, proposals, messages, and branch conversation identifiers
are stored in D1. The local database lives under `.wrangler/state/v3/d1`; hosted
Sites use a separate managed database. Back up local state with the server stopped
before moving or cleaning the project. Browser preferences are not the model archive.

Each branch creates an OpenAI Conversation on its first AI request. Project
requirements, selected model data, and relevant history provide context for edits.
Automatic conversation compaction is not implemented. Failed or cancelled requests
clear the conversation association so the next request can reconstruct context;
this does not delete the abandoned conversation at OpenAI.

Share links expose only a fixed accepted model, not private chat or project notes.
Owners can revoke links and disable the STL download option, but displayed geometry
is still delivered to the recipient's browser. Hosted Sites access policies must
also allow the intended recipient; creating a link does not change that policy.

## Development and verification

```sh
pnpm test
pnpm typecheck
pnpm build
```

The latest recorded suite has **44 passing offline tests**, covering geometry,
project ownership and persistence, proposals, branching, locks, sharing, imports,
exports, and camera projection behavior. Tests use injected provider responses and
isolated SQLite databases: **no API key or paid AI calls are required**.

Run the offline conversation scenario alone:

```sh
node --import tsx --test --test-name-pattern='offline conversation' tests/projects.test.ts
```

Offline tests check application behavior, not the real model's design quality.
Browser checks and remaining release checks are recorded in [TODO.md](TODO.md).

### Architecture

React/Vinext and Sites on Cloudflare Workers, D1 persistence, a Three.js viewer,
JSCAD solid modeling, and the OpenAI Responses API with structured model data.
Browser geometry compilation runs in a Web Worker; server validation also builds
geometry. **AI-generated JavaScript is not executed.**

| Location | Responsibility |
| --- | --- |
| `components/workshop.tsx` | Chat, proposal review, comparison, and tool panels |
| `components/model-viewer.tsx` | Rendering, focus/fullscreen integration, and camera controls |
| `components/project-sidebar.tsx` | Project navigation, search, import, and archiving |
| `lib/projects/` | Persistence, ownership, proposals, locks, sharing, and conversation orchestration |
| `lib/cad/` | Model schema, geometry, change explanations, and file exports |
| `lib/ai.ts` | Provider requests and structured response handling |
| `db/schema.ts` and `drizzle/` | Database schema and migrations |

After schema changes, run `pnpm db:generate`, inspect the SQL, and apply it locally
with `pnpm db:migrate`. Keep previously applied migrations immutable.

### Hosting status

GitHub source and the hosted preview may differ. Configure hosted secrets separately;
local `.env` values and local database records are not uploaded automatically.
Hosted migrations and deployment remain pending for the current implementation.

A standalone public deployment needs verified authentication in place of the
Sites-specific identity boundary, plus usage limits for paid AI requests. Never
include `.env` or `.wrangler/state` in deployment archives.

## Help shape the project

Try a small functional part and [open an issue](https://github.com/dsf0809/3d-version-control/issues)
with what you expected, what happened, reproduction steps, and your browser.
For printing feedback, include your slicer, printer, and measured result. Screenshots
or a non-sensitive model example help; do not include API keys or private project data.

Useful next contributions include slicer validation, onboarding improvements,
per-part color support, and broader browser testing. Check [TODO.md](TODO.md) before
starting substantial work and open an issue to discuss the scope.

## License

Licensed under the [MIT License](LICENSE). Third-party dependencies retain their
own licenses.
