# api_layer/routes/voice_ws.py
# New dedicated WebSocket route for voice sessions.
# Handles: session lifecycle, transcript relay, prompt execution, TTS stub.
# Does NOT share state with /ws/ui or UIEventBus.

from __future__ import annotations
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

# Reuse the same prompt pipeline that typed console input uses
from core.command.command_kernel import evaluate_prompt

logger = logging.getLogger("ladylinux.voice")
router = APIRouter(tags=["voice"])


@router.websocket("/ws/voice")
async def voice_websocket(websocket: WebSocket) -> None:
    """
    Dedicated voice session channel. Each connection is isolated —
    no shared broadcast bus. Source tag ("console" | "widget") is
    carried through all events so the frontend can route rendering.
    """
    await websocket.accept()

    # Announce readiness to the connecting client
    await websocket.send_json({"event": "voice_ready"})

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({
                    "event": "voice_error",
                    "message": "Malformed JSON received.",
                    "source": "unknown",
                })
                continue

            event = msg.get("event")
            source = msg.get("source", "console")  # "console" | "widget"

            # ── voice_start: client began recording ──────────────────────
            if event == "voice_start":
                logger.info("[voice] session started — source: %s", source)
                # No server action needed for browser-STT phase

            # ── voice_stop: client stopped recording ─────────────────────
            elif event == "voice_stop":
                logger.info("[voice] session stopped — source: %s", source)

            # ── voice_text_final: browser STT produced final transcript ───
            elif event == "voice_text_final":
                text = msg.get("text", "").strip()
                if not text:
                    continue

                # Echo the confirmed transcript back so UI can render it
                await websocket.send_json({
                    "event": "stt_final",
                    "text": text,
                    "source": source,
                })

                # Route through the same pipeline as typed console input
                try:
                    result = evaluate_prompt(text)
                    response_text = (
                        result.get("content", {}).get("message")
                        or result.get("content", {}).get("output")
                        or str(result)
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.exception("[voice] prompt evaluation failed")
                    await websocket.send_json({
                        "event": "voice_error",
                        "message": f"Prompt failed: {exc}",
                        "source": source,
                    })
                    continue

                # Send final assistant response text
                await websocket.send_json({
                    "event": "assistant_final",
                    "text": response_text,
                    "source": source,
                })

                # TTS stub — Phase 2 will populate audio_b64 from a TTS engine
                await websocket.send_json({"event": "tts_started", "source": source})
                await websocket.send_json({"event": "tts_finished", "source": source})

            # ── tts_request: client requests server-side TTS ──────────────
            elif event == "tts_request":
                # Phase 1: not implemented — client uses browser TTS fallback
                logger.debug("[voice] tts_request received — Phase 1 stub")

            else:
                logger.debug("[voice] unknown event: %s", event)

    except WebSocketDisconnect:
        logger.info("[voice] client disconnected")
    except Exception:
        logger.exception("[voice] unhandled error in voice websocket")
