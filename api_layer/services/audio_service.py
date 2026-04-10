"""
Audio control service for LadyLinux.

Wraps pactl (PulseAudio/PipeWire CLI) for volume and mute operations.
All commands run as the desktop user via _desktop_runner — pactl requires
access to the PulseAudio/PipeWire D-Bus socket which is not available in
the ladylinux service user context.

Exposed tools: audio_mute, audio_unmute, audio_volume_set, audio_sink_list
"""

from __future__ import annotations

from api_layer.services._desktop_runner import run_as_desktop_user


def audio_mute() -> dict:
    """Mute the default audio sink."""
    result = run_as_desktop_user(["pactl", "set-sink-mute", "@DEFAULT_SINK@", "1"])
    return {
        "ok": result["ok"],
        "message": "Audio muted" if result["ok"] else result["stderr"],
    }


def audio_unmute() -> dict:
    """Unmute the default audio sink."""
    result = run_as_desktop_user(["pactl", "set-sink-mute", "@DEFAULT_SINK@", "0"])
    return {
        "ok": result["ok"],
        "message": "Audio unmuted" if result["ok"] else result["stderr"],
    }


def audio_toggle_mute() -> dict:
    """Toggle mute state on the default audio sink."""
    result = run_as_desktop_user(["pactl", "set-sink-mute", "@DEFAULT_SINK@", "toggle"])
    return {
        "ok": result["ok"],
        "message": "Mute toggled" if result["ok"] else result["stderr"],
    }


def audio_volume_set(level: int) -> dict:
    """
    Set the default sink volume to an absolute percentage (0–100).

    Args:
        level: Integer 0–100. Values outside this range are clamped.
    """
    # Clamp to safe range — pactl accepts values above 100% but that
    # risks audio distortion and speaker damage
    clamped = max(0, min(100, int(level)))
    result = run_as_desktop_user(
        ["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{clamped}%"]
    )
    return {
        "ok": result["ok"],
        "level": clamped,
        "message": f"Volume set to {clamped}%" if result["ok"] else result["stderr"],
    }


def audio_volume_get() -> dict:
    """
    Read current volume and mute state from the default sink.

    Parses `pactl get-sink-volume` and `pactl get-sink-mute` output.
    Returns volume as an integer percentage and muted as a bool.
    """
    vol_result = run_as_desktop_user(["pactl", "get-sink-volume", "@DEFAULT_SINK@"])
    mute_result = run_as_desktop_user(["pactl", "get-sink-mute", "@DEFAULT_SINK@"])

    volume_pct: int | None = None
    muted: bool | None = None

    # pactl output: "Volume: front-left: 65536 /  100% / ..."
    if vol_result["ok"]:
        for part in vol_result["stdout"].split():
            if part.endswith("%"):
                try:
                    volume_pct = int(part.rstrip("%"))
                    break
                except ValueError:
                    pass

    # pactl output: "Mute: yes" or "Mute: no"
    if mute_result["ok"]:
        muted = "yes" in mute_result["stdout"].lower()

    return {
        "ok": vol_result["ok"],
        "volume": volume_pct,
        "muted": muted,
        "message": f"Volume: {volume_pct}%, Muted: {muted}",
    }


def audio_sink_list() -> dict:
    """
    List available audio output sinks.

    Returns sink names and their current status so the frontend or LLM
    can present output device options to the user.
    """
    result = run_as_desktop_user(["pactl", "list", "sinks", "short"])
    sinks = []

    # pactl short output: "<index>\t<name>\t<module>\t<sample>\t<state>"
    if result["ok"]:
        for line in result["stdout"].splitlines():
            parts = line.split("\t")
            if len(parts) >= 2:
                sinks.append({
                    "index": parts[0].strip(),
                    "name": parts[1].strip(),
                    "state": parts[4].strip() if len(parts) > 4 else "unknown",
                })

    return {
        "ok": result["ok"],
        "sinks": sinks,
        "message": f"{len(sinks)} sink(s) found" if result["ok"] else result["stderr"],
    }
