# 🧠 Logos Debugger — Interactive Thinking Mode HUD Dashboard

![Logos Debugger UI Snapshot](./logos-debugger-ui.png)

**Logos Debugger** is a premium, high-performance web dashboard and local agentic developer harness designed to debug, trace, and inspect codebases using the official **Google Antigravity SDK** and local **Gemma / Gemini** models. 

It provides real-time streaming of local agent thought traces, temporal spines, variable transition trackers, and a fully interactive 2D node execution canvas, featuring **Human-in-the-Loop** execution steering.

---

## ✨ Features

* **🧠 Antigravity Chat Panel**: A highly-responsive, multi-mode chat console featuring autocomplete codebase mentions (using `@`), real-time streaming tokenization, expandable **"🧠 Thinking Track"** blocks, and collapsible **"⚙️ Tool Execution"** parameters.
  * *Layout Modes*: Seamlessly toggle between **Standard (Sidebar) View**, **Split 50/50 Screen**, and **Maximized (Ultra-Wide) View** for spacious debug workflows.
* **🪐 Interactive 2D execution Canvas**: Powered by `@xyflow/react`, renders execution flow traces as interactive state nodes with dynamic colors and micro-animations representing `thinking`, `running`, `completed`, and `failed` operations.
* **📂 Workspace File Explorer**: A state-connected directory tree that automatically highlights files accessed by the agent:
  * 🟠 **Glowing Orange Dots** represent files **read** by the agent.
  * 🟢 **Glowing Teal Dots** represent files **modified/written** by the agent.
* **⏱️ Temporal Spinal Timeline**: A vertical chronologic list recording every node, execution trace, stdout log event, and bound state transition.
* **🛡️ Glassmorphic Consent Gateways**: Suspends execution on risky write operations (`create_file`, `edit_file`, `run_command`), enabling the developer to **Approve** or **Steer** the agent's next logical step with specific notes.
* **🗃️ Secure Environmental Keys**: Automatically inherits your workspace keys (`GEMINI_API_KEY`, etc.), keeping cleartext credentials 100% hidden from terminal listeners or CLI log dumps.

---

## 🏗️ Dual-Layer Architecture

Logos separates sandbox filesystem operations from telemetry presentation layers:

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
|     - Workspace Selector & Persistence                    |
|     - Left Sidebar: Workspace Folder-Tree File Explorer   |
|     - Left Sidebar Switcher: Temporal Spinal Timeline     |
|     - Center Canvas: Interactive 2D React Flow Node Graph |
|     - Consent overlay: Glassmorphic Approval Modal        |
|                                                           |
+-----------------------------------------------------------+
```

For the complete API schema mapping and internal pipeline specifications, read the [LOGOS_ARCHITECTURE.md](./LOGOS_ARCHITECTURE.md) blueprint.

---

## 🚀 Quick Start & Setup

### 1. Prerequisites
Ensure you have Python and Node installed:
```bash
python3 --version
node --version
```

Verify your python SDK dependencies:
```bash
pip3 install google-antigravity httpx
```

### 2. Launch the HUD Server
Navigate to the web application directory and boot up the development server:
```bash
cd logos-debugger
npm install
npm run dev
```

### 3. Open your Web Console
Open your browser and navigate to:
```text
http://localhost:3000
```

### 4. Connect Your Workspace
1. Input your local codebase absolute path in the header folder picker (or hit the **📂 Open** button to trigger native folder picker).
2. Configure your local Gemma endpoint or Gemini API Key under the **Gemma Settings** gear.
3. Submit your debugging prompt inside the **Antigravity Chat Panel** and start steering your agent's thinking!
