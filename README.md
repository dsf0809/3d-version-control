# Form — 3D Workshop

**Describe a part. Inspect every change. Keep the versions that work.**

Form is an AI-assisted workspace for functional 3D-printed parts. Chat beside an
interactive model, preview proposed edits, and compare saved versions before
accepting a change. Removed geometry is **red**, added geometry is **green**, and
unchanged geometry is **gray**.

Use it to explore trays, enclosures, simple brackets, and other parts built from
basic solids. Start with the included tray demo—no API key needed.

Run it on your own computer as a small server that your other devices and your
coworkers can open in a browser, with accounts for each person and AI from
OpenAI, Anthropic, Gemini, OpenRouter, or local models.

Form is an early preview. Live AI design quality, slicer compatibility, and
physical print results still need broader validation.

## Try the comparison demo

After [starting the server](#run-your-workshop-server) and signing in:

1. Open **Demo — tray comparison** from the project sidebar.
2. Select **Changes Comparison** and compare **V0 → V1**. The tray divider moves
   from right to left; red and green show its old and new locations.
3. Use **From**, **To**, and **Swap** to inspect versions in either direction.
4. Switch to **Model Original** to see the model without comparison colors.
5. Use **Export & print** to download an accepted revision for your slicer.

The demo contains saved models; it does not simulate a live AI response. It is
created once per user, and reopening it preserves subsequent edits.

## What you can do

| Capability | How it helps |
| --- | --- |
| AI edit permissions | Review, refine or discard proposals by default; optionally auto-apply validated new AI edits per project |
| Version comparison | Compare any two saved project revisions, including across branches, or preview a pending proposal |
| Saved projects and branches | Return to earlier designs with their conversation and revision history |
| Manual feature edits | Adjust dimensions, position, feature colors and linked dimensions without an AI request |
| Team contributions | Invite viewers/editors, contribute on protected branches, resolve conflicts and review merges |
| Dimension locks | Protect selected feature dimensions across AI edits, manual edits, branches, and restoration |
| Measured changes | Read before/after values and highlight the affected feature bounds |
| Starting templates | Create a tray, open enclosure or L bracket with validated width, depth, height and wall thickness |
| Request recovery | Check saved generation phases and recover a completed response after reload without sending a duplicate AI request |
| Focus and fullscreen | Expand the model view while inspecting details; focus toggling preserves model scale and screen position |
| Editable JSON import | Start a new project from a previously exported Form model |
| STL and 3MF export | Download accepted geometry in millimeters for slicer preparation |
| Read-only sharing | Share a fixed accepted revision, revoke its link, and control the STL download option |

Projects can be searched, renamed, archived, and restored from the sidebar.
The layout adapts to desktop, laptop, and narrower windows. Each browser tab
remembers its own project, branch and editing revision across reloads. Browsing
uses read-only requests; comparison controls do not change the editing or export
target. Custom comparison pairs survive editing-revision changes within a project.
The camera stays in place through geometry and comparison changes; **Fit model**
reframes it explicitly. Rendering pauses when idle. Long conversations load the
latest 40 messages, with **Load earlier messages** for older pages.

Owners can invite editors or viewers from **Project details → Team & access**.
Invitations are single-use links valid for seven days; membership and invitations
can be revoked. Editors create their own branches (chat automatically branches when
needed). The owner controls Main and project settings. Use **Refresh branch** to
load teammates' latest accepted changes, and **Merge branches** to compare with a
common ancestor, resolve conflicting values, and prepare a proposal for approval.
Revisions record authors and merge parents. This is asynchronous collaboration;
there are no live cursors, simultaneous co-editing, or external Git synchronization.
Teammates sign in to the same Form server; see [Run your workshop server](#run-your-workshop-server).

## Run your workshop server

Form runs on one computer (a laptop, desktop or always-on PC) and everyone else
opens it in a browser: your phone, tablet, other computers, or your coworkers'
machines on the same network.

**Requirements:** Node.js 22.13 or newer and pnpm.

```sh
git clone https://github.com/dsf0809/3d-version-control.git form-3d-workshop
cd form-3d-workshop
pnpm install
# Preserve an existing local configuration.
test -f .env || cp .env.example .env
pnpm serve
```

`pnpm serve` builds the app and starts the server; `pnpm start` restarts it
without rebuilding. The terminal prints the addresses to use:

```text
  On this computer:   http://localhost:3000
  On your network:    http://192.168.1.23:3000
```

1. **Set up the administrator.** The first person to open the server creates the
   administrator account. Projects from an earlier single-user installation on
   this computer are kept and belong to that account.
2. **Add people.** Open your name in the top-right corner → **People**. Either
   add each person (they get a temporary password and choose their own on first
   sign-in), or turn on **Self sign-up** and share the join code.
3. **Share the network address.** Others open the "On your network" address. The
   first time, macOS or Windows may ask whether Node.js may accept incoming
   connections; allow it on private networks.

Forgotten passwords are reset by an administrator (**Reset password**).
Administrators can also disable accounts, which signs them out everywhere.

For development with hot reload, use `pnpm dev` (local only by default).

### Connect AI

Each person can add their own API key under **AI connection**, and the
administrator can share one connection with everyone. A personal key always takes
precedence over the shared one.

| Provider | Notes |
| --- | --- |
| OpenAI | Responses API with saved per-branch conversations |
| Anthropic (Claude) | Defaults to `claude-opus-5-5` with structured output |
| Google Gemini | Gemini's OpenAI-compatible endpoint; enter a model name |
| OpenRouter | Any model OpenRouter offers, e.g. `provider/model` |
| Ollama | Local models on the server computer; no key needed |
| OpenAI-compatible | Any endpoint that serves `/chat/completions` (LM Studio, vLLM, …) |

**Shared connection:** set it in **Account → Shared AI connection** or with
`AI_PROVIDER`, `AI_API_KEY` and `AI_MODEL` in `.env` (the earlier
`OPENAI_API_KEY`/`OPENAI_MODEL` still work). Requests on the shared key bill the
server owner, so each non-admin person is limited to a number of requests per day
(50 by default, adjustable there). Retried requests are not counted twice.

**Custom endpoints** (Ollama and OpenAI-compatible) make the server fetch the URL
you enter, so only administrators can set them unless `FORM_ALLOW_CUSTOM_AI_URLS=1`.

Keys are encrypted at rest and never sent back to browsers. Saving a key does not
make a test request; the first chat request does. Models must support structured
JSON output; replies are validated before any geometry is saved, so a model that
returns invalid designs fails safely without changing your project. Failed or
interrupted requests are never retried automatically.

Try a specific request such as:

> Move the tray divider 10 mm to the left. Keep the outer dimensions unchanged.

## Design, review, and print

1. **Create or import a project.** Add a brief and requirements in project details,
   or use **Import model JSON** in the sidebar. Imports accept Form model JSON up
   to 1 MB, not STL, 3MF, or arbitrary CAD scripts.
2. **Request or make an edit.** Chat with the assistant or use **Edit dimensions**.
   AI responses and resulting geometry are validated before saving. Use **AI changes**
   above the chat input to choose **Review changes** (default) or **Apply automatically**.
3. **Review the proposal.** Use the comparison and measured changes. The accepted
   design stays unchanged until you choose **Accept changes**. Pending proposals
   survive reloads; failed or cancelled refinements preserve the previous proposal.
   Automatic mode saves validated new AI edits as revisions. Dimension locks still
   apply. Existing proposals, refinements, manual edits and restores still require review.
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
| 3MF | Millimeter geometry and feature display colors |
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
- **Feature colors:** supported in original view, editable JSON and 3MF materials.
  Comparison colors indicate geometry changes; color-only edits appear in measured
  changes. Slicers may replace display colors with their filament settings.
- **No STL/3MF mesh import:** the editable import route accepts Form JSON only.
- **Asynchronous team workflow:** no live presence, comments or project deletion.
  Archiving is available. Separate servers do not synchronize with each other.
- **Comparisons measure geometry:** moving a part appears as removal and addition.
  Feature highlights outline source primitives, not exact ownership of every
  Boolean surface. Legacy feature matching can be ambiguous after renames.
- **Printing still needs verification:** valid geometry does not establish
  printability, fit, or strength. Physical test prints remain part of the roadmap.

## Data, conversations, and sharing

Projects, accounts, model snapshots, proposals, messages and queued AI jobs are
stored in a SQLite database at `data/form.db` (set `FORM_DATA_DIR` to move it). The
same folder holds `secret.key`, which encrypts saved API keys, unless
`AI_KEY_ENCRYPTION_SECRET` is set. Browser preferences are not the model archive.

Run `pnpm backup` at any time, including while the server runs, to write a
consistent copy of the database and the key file to `data/backups/`. Restore by
stopping the server and copying both back. Keep backups private: they contain
project data and encrypted keys.

On first start, an existing database from the earlier Cloudflare-based local setup
(`.wrangler/state`) is copied into the data folder. The original is left untouched.

With OpenAI, each branch creates an OpenAI Conversation on its first AI request.
Other providers do not keep server-side conversations; each request includes the
project context and the branch's recent discussion instead. Project requirements,
selected model data, and relevant history provide context for edits. Failed or
cancelled requests clear the conversation association so the next request can
reconstruct context; this does not delete the abandoned conversation at OpenAI.

Share links expose only a fixed accepted model, not private chat or project notes.
Owners can revoke links and disable the STL download option, but displayed geometry
is still delivered to the recipient's browser. Share links work for anyone who can
reach the server, without an account.

## Checks

```sh
pnpm test
pnpm typecheck
pnpm build
```

Tests use mock AI responses and isolated in-memory databases; no API key or paid
requests are required. They cover accounts, sessions, AI connections and quotas,
every provider protocol and the background job runner. Offline tests verify
application behavior, not AI design quality.

## Network access and security

The server is a single Node.js process with an embedded SQLite database; there is
no cloud service to configure. Keep these in mind before sharing it:

- **Use trusted networks.** On a home or office network, plain `http://` works,
  but traffic, including passwords, is not encrypted. Avoid public Wi-Fi.
- **Reaching it from elsewhere.** Don't forward a router port to the server.
  Prefer one of:
  - [Tailscale](https://tailscale.com) (or another private VPN): install it on the
    server and each device, then open `http://<server-name>:3000`. Only your
    tailnet can connect, and traffic is encrypted.
  - [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
    or `tailscale funnel`: gives a public `https://` address without opening
    ports. Anyone can reach the sign-in page, so keep self sign-up off or rotate
    the join code, and use strong passwords.
  - A reverse proxy with HTTPS (Caddy, nginx) on your network.

  Behind a tunnel or proxy that sets `X-Forwarded-*` headers, set
  `FORM_TRUST_PROXY=1` so sessions use secure cookies and sign-in rate limits see
  real client addresses.
- **Restrict to this computer** with `HOST=127.0.0.1`.
- **Sign-ins** use hashed passwords (scrypt), HTTP-only session cookies valid for
  30 days, and a lockout after repeated failed attempts. Changing a password signs
  out other devices.
- **Keep the computer awake** while others use the server. To run it in the
  background, use a process manager such as `pm2`, a macOS LaunchAgent or a
  Windows scheduled task that runs `pnpm start` in the project folder.

## Help shape the project

Try a small functional part and [open an issue](https://github.com/dsf0809/3d-version-control/issues)
with what you expected, what happened, reproduction steps, and your browser.
For printing feedback, include your slicer, printer, and measured result. Screenshots
or a non-sensitive model example help; do not include API keys or private project data.

Useful next contributions include slicer validation, onboarding improvements,
mesh import, team comments, and broader browser testing. Open an issue to discuss
substantial changes before starting work.

## License

Licensed under the [MIT License](LICENSE). Third-party dependencies retain their
own licenses.
