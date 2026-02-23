"""EchoBridge MCP server — stdio transport for Claude Desktop / OpenClaw."""

import os
import sys

# Ensure backend directory is on the path
sys.path.insert(0, os.path.dirname(__file__))

from mcp_server import mcp  # noqa: E402

if __name__ == "__main__":
    mcp.run(transport="stdio")
