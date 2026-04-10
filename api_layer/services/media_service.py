"""
Media playback control service for LadyLinux.

Wraps playerctl, which communicates with MPRIS-compatible media players
(Spotify, VLC, Firefox, Chromium, etc.) over D-Bus. All commands run as
the desktop user via _desktop_runner — D-Bus is not available in the
ladylinux service user context.

Exposed tools: media_play, media_pause, media_toggle, media_next,
               media_prev, media_stop, media_status
"""

from __future__ import annotations

from api_layer.services._desktop_runner import run_as_desktop_user


def media_play() -> dict:
    """Resume playback on the active media player."""
    result = run_as_desktop_user(["playerctl", "play"])
    return {
        "ok": result["ok"],
        "message": "Playback started" if result["ok"] else result["stderr"],
    }


def media_pause() -> dict:
    """Pause the active media player."""
    result = run_as_desktop_user(["playerctl", "pause"])
    return {
        "ok": result["ok"],
        "message": "Playback paused" if result["ok"] else result["stderr"],
    }


def media_toggle() -> dict:
    """Toggle play/pause on the active media player."""
    result = run_as_desktop_user(["playerctl", "play-pause"])
    return {
        "ok": result["ok"],
        "message": "Playback toggled" if result["ok"] else result["stderr"],
    }


def media_next() -> dict:
    """Skip to the next track."""
    result = run_as_desktop_user(["playerctl", "next"])
    return {
        "ok": result["ok"],
        "message": "Skipped to next track" if result["ok"] else result["stderr"],
    }


def media_prev() -> dict:
    """Go back to the previous track."""
    result = run_as_desktop_user(["playerctl", "previous"])
    return {
        "ok": result["ok"],
        "message": "Went to previous track" if result["ok"] else result["stderr"],
    }


def media_stop() -> dict:
    """Stop playback entirely."""
    result = run_as_desktop_user(["playerctl", "stop"])
    return {
        "ok": result["ok"],
        "message": "Playback stopped" if result["ok"] else result["stderr"],
    }


def media_status() -> dict:
    """
    Return current playback state and track metadata.

    Queries playerctl for status, title, artist, and album.
    Returns ok=True with empty fields if no player is running — this is
    normal and should not be treated as an error by the tool router.
    """
    # Each playerctl metadata call is a separate D-Bus query
    status_result = run_as_desktop_user(["playerctl", "status"])
    title_result = run_as_desktop_user(["playerctl", "metadata", "title"])
    artist_result = run_as_desktop_user(["playerctl", "metadata", "artist"])
    album_result = run_as_desktop_user(["playerctl", "metadata", "album"])

    # playerctl exits non-zero if no player is open — treat that as
    # "no player" rather than a hard error
    no_player = not status_result["ok"]

    return {
        "ok": True,  # always ok — "no player" is valid state
        "playing": status_result["stdout"].lower() == "playing" if status_result["ok"] else False,
        "status": status_result["stdout"] if status_result["ok"] else "No player",
        "title": title_result["stdout"] if title_result["ok"] else "",
        "artist": artist_result["stdout"] if artist_result["ok"] else "",
        "album": album_result["stdout"] if album_result["ok"] else "",
        "message": status_result["stdout"] if not no_player else "No media player active",
    }
