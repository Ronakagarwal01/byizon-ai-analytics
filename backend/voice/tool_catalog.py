from __future__ import annotations

TOOLS = [
    ("navigate", "Open a named application page.", {"page": {"type": "string", "enum": ["home", "upload", "dashboard", "chat", "reports", "connections"]}}),
    ("go_back", "Return to the previous page.", {}),
    ("refresh_page", "Refresh the current page.", {}),
    ("scroll_page", "Scroll the current page.", {"direction": {"type": "string", "enum": ["up", "down", "top", "bottom"]}}),
    ("attach_dataset", "Open the dataset file picker.", {}),
    ("new_chat", "Start a new text conversation without deleting the dataset.", {}),
    ("open_dashboard", "Open the adaptive dashboard for the current dataset.", {}),
    ("open_reports", "Open the generated analysis report.", {}),
    ("open_connections", "Open business data connections.", {}),
    ("create_protected_share", "Create a password-protected live link for the currently uploaded dataset.", {}),
    (
        "run_connected_command",
        "Run a Gmail, Google Calendar, Google Meet, Google Docs, or Google Sheets command through the authorized account.",
        {"command": {"type": "string"}},
    ),
]


def openai_tools() -> list[dict]:
    output = []
    for name, description, properties in TOOLS:
        output.append({
            "type": "function",
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": list(properties),
                "additionalProperties": False,
            },
            "strict": True,
        })
    return output


def public_catalog() -> list[dict]:
    return [{"name": name, "description": description} for name, description, _ in TOOLS]
