# VSCode as MCP Server

[Marketplace](https://marketplace.visualstudio.com/items?itemName=acomagu.vscode-as-mcp-server)

A VSCode extension that turns your VSCode into an MCP server, enabling advanced coding assistance from MCP clients like Claude Desktop.

## Key Features

### Code Editing Support
- Review proposed code changes from an LLM through diffs, allowing you to accept, reject, or provide feedback.
- Real-time diagnostic messages (e.g., type errors) sent instantly to the LLM for immediate corrections.

![Code editing diff](https://storage.googleapis.com/zenn-user-upload/778b7e9ad8c4-20250407.gif)

### Terminal Operations
- Execute commands within VSCode’s integrated terminal (supports background/foreground execution, and timeout settings).

### Preview Tools
- Preview URLs directly within VSCode’s built-in browser (e.g., automatically opens browser preview after starting a Vite server).

![Preview tool](https://storage.googleapis.com/zenn-user-upload/8968c9ad3920-20250407.gif)

### Multi-instance Switching
- Easily switch the MCP server between multiple open VSCode windows.(Just by clicking the status bar item)

![Instance switching](https://storage.googleapis.com/zenn-user-upload/0a2bc2bee634-20250407.gif)

### Relay Functionality (Experimental)
- Relay and expose built-in MCP servers introduced in VSCode 1.99 externally.
- Allows external access to tools provided by other MCP extensions, such as GitHub Copilot.

## Available Built-in Tools

- **execute_command**: Execute commands in VSCode’s integrated terminal
- **code_checker**: Retrieve current diagnostics for your code
- **focus_editor**: Focus specific locations within files
- **list_debug_sessions** / **start_debug_session** / **restart_debug_session** / **stop_debug_session**: Manage debug sessions
- **text_editor**: File operations (view, replace, create, insert, undo)
- **list_directory**: List directory contents in a tree format
- **get_terminal_output**: Fetch output from a specified terminal
- **list_vscode_commands** / **execute_vscode_command**: List and execute arbitrary VSCode commands
- **preview_url**: Open URLs within VSCode’s integrated browser

## Installation & Setup

1. Install the extension from the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=acomagu.vscode-as-mcp-server).

2. Configure your MCP client:

    - **Using mcp-installer**: You can simply instruct it to "install the vscode-as-mcp-server MCP server".
    - **Other clients like Claude Desktop**: Add the following to your configuration file (`claude_desktop_config.json`):

    **Standard Configuration (npm package):**
    ```json
    {
      "mcpServers": {
        "vscode": {
          "command": "npx",
          "args": ["vscode-as-mcp-server"]
        }
      }
    }
    ```

    **WSL Configuration (recommended for WSL users):**
    If you're running Claude Desktop on Windows but VSCode in WSL, use the local relay:
    ```json
    {
      "mcpServers": {
        "vscode-as-mcp-server": {
          "type": "stdio",
          "command": "node",
          "args": [
            "/path/to/vscode-as-mcp-server/packages/relay/dist/index.js"
          ],
          "env": {}
        }
      }
    }
    ```

    **WSL with Custom IP (if auto-detection fails):**
    ```json
    {
      "mcpServers": {
        "vscode-as-mcp-server": {
          "type": "stdio",
          "command": "node",
          "args": [
            "/path/to/vscode-as-mcp-server/packages/relay/dist/index.js",
            "--server-url",
            "http://172.18.64.1:60100"
          ],
          "env": {}
        }
      }
    }
    ```

    **Development Configuration (local build):**
    ```json
    {
      "mcpServers": {
        "vscode-as-mcp-server": {
          "type": "stdio",
          "command": "node",
          "args": [
            "/path/to/vscode-as-mcp-server/packages/relay/dist/index.js",
            "--server-url",
            "http://localhost:60100"
          ],
          "env": {}
        }
      }
    }
    ```

3. Check the MCP server status in the bottom-right VSCode status bar:

    - (Server icon): Server is running
    - ∅: Click to start the server

![Server status indicator](https://storage.googleapis.com/zenn-user-upload/321704116d4a-20250408.png)

## Troubleshooting

### WSL Configuration Issues

If you're using WSL and experiencing connection issues:

1. **Check VSCode Extension Status**: Ensure the VSCode extension shows a server icon (🖥️) in the status bar, not ∅.

2. **Test Windows Host Connection**: Run this PowerShell script on Windows to verify the extension is accessible:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:60100/" -Method POST -Body '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' -ContentType "application/json"
   ```

3. **Find the Correct IP**: The relay auto-detects the Windows host IP, but you can manually test different IPs:
   ```bash
   # Test common WSL bridge IPs
   curl -X POST http://172.18.64.1:60100/ -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
   curl -X POST http://172.19.0.1:60100/ -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
   ```

4. **Build the Relay**: If using the development configuration, ensure the relay is built:
   ```bash
   cd packages/relay
   pnpm install
   pnpm build
   ```

### JSON Schema Compatibility

The extension automatically ensures all tools use JSON Schema 2020-12 format required by Claude's API. If you encounter schema validation errors:

1. **Restart the MCP Server**: Click the status bar item in VSCode and restart the server.
2. **Check Extension Logs**: View the "VSCode MCP Server" output channel in VSCode for error details.
3. **Update the Extension**: Ensure you're using the latest version from the marketplace.

### Common Error Messages

- **"tools.X.custom.input_schema: JSON schema is invalid"**: The relay will automatically fix these schema compatibility issues.
- **"Failed to connect"**: Check that VSCode is running and the extension is active (server icon in status bar).
- **"Connection refused"**: Verify the IP address and port (60100) are correct for your WSL setup.

## Motivation

This extension was developed to mitigate high costs associated with metered coding tools (like Roo Code and Cursor). It's an affordable, self-hosted alternative built directly into VSCode.

Bug reports and feedback are very welcome! 🙇

## Future Roadmap

- Ability to select which built-in MCP servers to expose
- WebView-based approval UI (similar to Roo Code)
- Integration with VSCode's file history (Timeline)
- Instant toggling of auto-approvals and tool activation/deactivation
- Customizable server port configuration
