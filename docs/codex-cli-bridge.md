# Loop Agent: local Codex CLI bridge

Loop Lab can use an existing Codex CLI login during local development. The browser never receives or stores OpenAI credentials. The Vite development server launches `codex exec` for each request and passes it a read-only project snapshot.

## Setup

1. Install or update Codex CLI:

   ```powershell
   npm install -g @openai/codex@latest
   codex --version
   ```

2. Sign in with the ChatGPT account you want Codex to use:

   ```powershell
   codex login
   codex login status
   ```

3. Start Loop Lab from the repository root:

   ```powershell
   npm run dev
   ```

4. Open `http://127.0.0.1:5173`, select the **Agent** tab, and click **Connect Codex CLI** if it does not connect automatically.

5. Send a prompt. Codex responses may include reviewable file proposals. A proposal changes nothing until **Apply** is clicked.

## Safety model

- Codex runs with the `read-only` sandbox.
- The bridge sends code files, project parameters, world dimensions, runtime status, and recent Agent conversation messages to Codex.
- Imported binary assets are not sent.
- Codex returns structured proposals rather than editing the repository.
- Loop Lab applies each proposal through its permission-aware workspace API only after a user clicks **Apply**.
- This bridge is available through the Vite development server. A packaged desktop release will need an equivalent native bridge.

## Troubleshooting

- **Offline / Codex CLI not found:** confirm `codex --version` works in the same terminal where `npm run dev` is started, then restart the dev server.
- **Installed but not signed in:** run `codex login`, complete the browser sign-in, and press **Connect Codex CLI** again.
- **Request fails after an update:** run `codex exec --help` and update Codex with `npm install -g @openai/codex@latest`.
- **Port unavailable:** close the existing Loop Lab dev process and rerun `npm run dev`. The project is pinned to port 5173.
