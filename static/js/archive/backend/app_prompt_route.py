# ARCHIVED FILE — extracted for UI portability
# Source: api_layer/app.py
# NOTE: This file may require dependency wiring when re-integrated
@app.post("/api/prompt")
async def prompt(req: PromptRequest):
    """
    Transport compatibility layer.

    The frontend currently sends prompts to /api/prompt.
    Internally forward the request to the command kernel route
    implemented in /ask_rag so the UI does not need modification.
    """
    return await ask_rag(req)
