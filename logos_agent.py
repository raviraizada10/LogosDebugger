#!/usr/bin/env python3
import argparse
import asyncio
import httpx
import json
import sys
import time
from google.antigravity import Agent, LocalAgentConfig, types
from google.antigravity.hooks import hooks
from google.antigravity.types import BuiltinTools

# 1. CLI Arguments parsing
parser = argparse.ArgumentParser(description="Logos Codebase Debugger Sidecar Agent")
parser.add_argument("--session-id", required=True, help="Unique session ID")
parser.add_argument("--workspace", required=True, help="Path to target workspace repository")
parser.add_argument("--prompt", required=True, help="Developer prompt / debugging query")
parser.add_argument("--api-key", help="Google Gemini API Key (optional)")
parser.add_argument("--backend-url", default="http://localhost:3000", help="Debugger backend URL")
args = parser.parse_args()

session_id = args.session_id
workspace = args.workspace
backend_url = args.backend_url

# Helper function to post to telemetry route
async def post_telemetry(status=None, token=None, event=None):
    payload = {
        "sessionId": session_id,
        "timestamp": int(time.time() * 1000)
    }
    if status is not None:
        payload["status"] = status
    if token is not None:
        payload["token"] = token
    if event is not None:
        payload["event"] = event
        
    try:
        async with httpx.AsyncClient() as client:
            await client.post(f"{backend_url}/api/telemetry", json=payload)
    except Exception as e:
        # Print warning to stderr
        print(f"Warning: Telemetry POST failed: {e}", file=sys.stderr)

# 2. Define Telemetry & Approval Hooks using the required decorators
@hooks.on_session_start
async def on_session_start_hook():
    # Posts status: thinking and a session start log event
    await post_telemetry(
        status="thinking",
        event={
            "type": "log",
            "level": "info",
            "message": "Logos agent session started."
        }
    )

@hooks.pre_tool_call_decide
async def pre_tool_call_decide_hook(data: types.ToolCall) -> types.HookResult:
    # Identify tool name - handle string and BuiltinTools enum
    tool_name = data.name
    if hasattr(tool_name, "value"):
        tool_name = tool_name.value
    tool_name = str(tool_name)
    
    # Extract tool arguments safely
    tool_args = {}
    if hasattr(data, "args"):
        try:
            tool_args = dict(data.args) if data.args is not None else {}
        except Exception:
            tool_args = {}
            
    safe_tools = {'list_directory', 'search_directory', 'find_file', 'view_file', 'finish'}
    risky_tools = {'create_file', 'edit_file', 'run_command'}
    
    if tool_name in safe_tools:
        # Check if it is a file access tool (like view_file) or has path args
        file_path = tool_args.get("AbsolutePath") or tool_args.get("path") or tool_args.get("filePath")
        if file_path:
            # Send file-accessed telemetry event so frontend tree explorer glows
            await post_telemetry(
                event={
                    "type": "file-accessed",
                    "filePath": file_path,
                    "operation": "read"
                }
            )
        return types.HookResult(allow=True)
        
    elif tool_name in risky_tools:
        # Generate a unique step ID
        step_id = f"step-{int(time.time() * 1000)}"
        
        # Suspend execution by doing a blocking HTTP POST to wait endpoint
        wait_payload = {
            "sessionId": session_id,
            "stepId": step_id,
            "toolName": tool_name,
            "args": tool_args
        }
        
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                res = await client.post(f"{backend_url}/api/session/wait", json=wait_payload)
                if res.status_code == 200:
                    decision = res.json()
                    action = decision.get("action")
                    notes = decision.get("notes", "")
                    
                    if action == "approve":
                        # If approved, return HookResult allow=True
                        return types.HookResult(allow=True)
                    elif action == "steer":
                        # If steered, return HookResult allow=False with developer notes
                        return types.HookResult(allow=False, message=notes)
                elif res.status_code == 410:
                    return types.HookResult(allow=False, message="Developer rejected or superceded the request.")
        except Exception as e:
            print(f"Warning: Developer approval long-poll failed: {e}", file=sys.stderr)
            # Default to auto-approve to avoid hanging when wait server is offline
            return types.HookResult(allow=True)
            
    # Default fallback for other tools
    return types.HookResult(allow=True)

@hooks.post_tool_call
async def post_tool_call_hook(data):
    # Post telemetry event showing completion
    await post_telemetry(
        event={
            "type": "log",
            "level": "info",
            "message": "Tool execution completed successfully."
        }
    )

@hooks.on_tool_error
async def on_tool_error_hook(data: Exception):
    # Post tool failure details
    await post_telemetry(
        event={
            "type": "log",
            "level": "error",
            "message": f"Tool execution encountered an error: {str(data)}"
        }
    )
    return None  # Let the error propagate

# 3. Main runner loop
async def main():
    system_instructions = (
        "You are Logos, an elite Interactive Thinking Mode Code Debugger.\n"
        "Your task is to analyze the codebase context and output a precise resolution.\n"
        "CRITICAL: You MUST structure your entire response using the following XML tags:\n"
        "1. <thought>Your analytical reasoning here...</thought>\n"
        "2. <step name=\"step_name\" args=\"{}\">Your structural step context here...</step>\n"
        "3. <call name=\"tool_name\" args=\"{}\">Simulate a tool execution...</call>\n"
        "4. <response>Your code changes or tool output here...</response>\n"
        "Ensure every tool call is enclosed in <call name=\"...\" args=\"{}\">...</call> and you wait for execution results."
    )
    
    config_kwargs = {
        "system_instructions": system_instructions,
        "workspaces": [workspace],
        "hooks": [
            on_session_start_hook,
            pre_tool_call_decide_hook,
            post_tool_call_hook,
            on_tool_error_hook
        ]
    }
    if args.api_key:
        config_kwargs["api_key"] = args.api_key
        
    config = LocalAgentConfig(**config_kwargs)
    
    async with Agent(config=config) as agent:
        try:
            response = await agent.chat(args.prompt)
            
            # Stream reasoning thoughts block
            async for thought in response.thoughts:
                token_text = thought.text if hasattr(thought, 'text') else str(thought)
                await post_telemetry(token=token_text)
                
            # Stream final response
            async for token in response:
                token_text = token.text if hasattr(token, 'text') else str(token)
                await post_telemetry(token=token_text)
                
            # Post completed status
            await post_telemetry(status="completed")
        except Exception as e:
            # Catch and log any execution / policy / connection exceptions back to telemetry
            error_msg = f"Agent Execution Error: {str(e)}"
            print(f"Error during agent chat run: {e}", file=sys.stderr)
            await post_telemetry(
                status="error",
                event={
                    "type": "log",
                    "level": "error",
                    "message": error_msg
                }
            )
            # Send the error message directly into the chat stream so the user sees it
            await post_telemetry(token=f"\n\n❌ **{error_msg}**")
            raise e

if __name__ == "__main__":
    asyncio.run(main())
