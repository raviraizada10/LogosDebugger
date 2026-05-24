# LOGOS — System Architecture, Context & Execution Plan

This document serves as the official blueprint and reference manual for **Logos**, a premium-grade Interactive Thinking Mode Code Debugger. It documents the final architecture, data flow schemas, codebase context, and developer setup procedures for the unified dual-layer system.

---

## 1. System Architecture

Logos is designed as a **dual-layer agentic framework** that separates filesystem execution and codebase search from the developer telemetry interface. This ensures complete sandboxing, minimal external dependencies, and a high-fidelity visual experience without needing complex IDE plugin overrides.

```
                  LOCAL DEVELOPER MACHINE
+-----------------------------------------------------------+
|                                                           |
|  1. AGENT ENGINE (Python Sidecar Process)                 |
|     Uses: google-antigravity SDK                          |
|     - Binds filesystem capabilities to target workspace   |
|     - Recursively inspects classes, imports, & subclasses |
|     - Streams thoughts & intercepts risky tools natively  |
|                                                           |
|          │                                   ▲            |
|          │ (HTTP POST telemetry)             │ (Long-Poll |
|          │                                   │  Consent)  |
|          ▼                                   │            |
|                                                           |
|  2. TELEMETRY GATEWAY & API BRIDGE (Next.js server-side)  |
|     - POST /api/telemetry (publishes events to RxJS bus)  |
|     - POST /api/session/wait (long-poll response bridge)  |
|     - POST /api/session/approve (resolves consent promise)|
|                                                           |
|          │                                   ▲            |
|          │ (Server-Sent Events Stream)       │ (HTTP POST |
|          │                                   │  Consent)  |
|          ▼                                   │            |
|                                                           |
|  3. VISUAL HUD DASHBOARD (Next.js Frontend React)         |
|     - Workspace Selector & Gemini API Key Inputs          |
|     - Left Sidebar: Workspace Folder-Tree File Explorer   |
|     - Left Sidebar Switcher: Temporal Spinal Timeline     |
|     - Center Canvas: Interactive 2D React Flow Node Graph |
|     - Consent overlay: Glassmorphic Approval Modal        |
|                                                           |
+-----------------------------------------------------------+
```

---

## 2. Telemetry and Approval Data Schemas

The Python Sidecar and Next.js API endpoints coordinate state transitions using clean JSON payload specifications:

### A. Real-Time Telemetry Event (`POST /api/telemetry`)
Emitted by the Python Agent during thoughts generation, tool executions, and file scans:
```json
{
  "sessionId": "session-live-abc1234",
  "timestamp": 1779625166000,
  "status": "thinking",            // optional: 'thinking' | 'completed' | 'error'
  "token": "Analyzing ",           // optional: reasoning thoughts character chunk
  "event": {                       // optional: structured lifecycle action
    "type": "file-accessed",       // 'file-accessed' | 'tool-call-start' | 'log'
    "filePath": "/src/billing.ts",
    "operation": "read",           // 'read' | 'write'
    "level": "info",               // for logs: 'info' | 'warn' | 'error'
    "message": "Scanned billing subclass definitions."
  }
}
```

### B. Human-in-the-Loop Consent (`POST /api/session/wait`)
Risk-checking tools (`create_file`, `edit_file`, `run_command`) execute a blocking HTTP long-poll request to suspension gateway:
```json
{
  "sessionId": "session-live-abc1234",
  "stepId": "step-1779625166050",
  "toolName": "run_command",
  "args": {
    "CommandLine": "npm run test"
  }
}
```
* **Synchronization Bridge**: The Next.js endpoint creates a pending promise in its local memory table, yielding an SSE broadcast to trigger the HUD modal. The request blocks until a client POSTs to `/api/session/approve`.

### C. Consent Resolution (`POST /api/session/approve`)
Dispatched by the frontend HUD once a developer decides the agent's action:
```json
{
  "sessionId": "session-live-abc1234",
  "stepId": "step-1779625166050",
  "action": "approve",             // 'approve' | 'steer'
  "notes": "Ensure you run with '--passWithNoTests' option." // developer guidance
}
```
* **Steering Feedback**: If `action` is `steer`, the Python agent rejects the tool execution and feeds the custom `notes` back into the context window, steering the model to find an alternate approach.

---

## 3. Codebase Context & Component Layout

The Logos codebase is built using a clean, modular structure. Below is the mapping of components:

### A. Core Engine Components
* **`logos_agent.py`** [NEW]: The standalone Python sidecar script. Utilizes `google-antigravity`'s `LocalAgentConfig` and `Agent` loops. Binds the agent's filesystem write tools strictly to the target repository folder, registers telemetry Hooks, and handles thought-character streams.
* **`src/lib/agentEngine.ts`** [MODIFIED]: Exposes process spawners that spawn `python3 logos_agent.py`. Ensures clean memory cleanup by registering handlers on SIGINT/SIGTERM to kill active subprocesses, avoiding orphaned python runners.
* **`src/app/api/session/start/route.ts`** [MODIFIED]: Endpoint parsing user arguments and triggering `logos_agent.py`. Hooks into client abort signals (`req.signal`) to instantly kill the child Python process if a developer cancels the run.

### B. Workspace UI Components
* **`src/app/api/workspace/tree/route.ts`** [NEW]: Recurses directories under the workspace target, ignoring `node_modules`, `.next`, and `.git` to compile a fast, high-performance file tree JSON.
* **`src/components/WorkspaceTree.tsx`** [NEW]: Renders a folder-tree file explorer. Subscribes to telemetry keys in the Zustand store to display a **Glowing Orange Dot** next to read files and a **Glowing Teal Dot** next to modified files.
* **`src/components/LogosWorkspace.tsx`** [MODIFIED]: Features:
  * Workspace path selector & masked Gemini API Key header input panel.
  * Sidebar Tab Switcher sliding between the Workspace Explorer and the Temporal thought stream.
  * Glassmorphic Consent Overlay modal capturing approves/steering inputs.

---

## 4. Setup & Launch Instructions

To launch the integrated Logos Debugger on your machine:

### 1. Requirements
Ensure Python and Node are installed:
```bash
python3 --version
node --version
```
Ensure dependencies are up to date. (We upgraded the system `protobuf` to v7.35.0 to ensure zero version mismatches):
```bash
pip3 install google-antigravity httpx
```

### 2. Launch Development Server
Navigate to the Next.js directory and run:
```bash
npm run dev
```

### 3. Open Browser HUD
Open your browser and navigate to:
```text
http://localhost:3000
```

### 4. Initiate Run
1. Enter your local repository target workspace absolute path (e.g. `/Volumes/Study/git/Gemma4Project`) in the header.
2. Enter your Gemini API Key. (If you need one, generate it instantly at [Google AI Studio](https://aistudio.google.com/app/api-keys)).
3. Input your debugging query / error logs and click **"Run Debugger"**.
4. Track the real-time thought timeline, inspect glowing codebase nodes, and steer agent modifications directly inside your web console.
