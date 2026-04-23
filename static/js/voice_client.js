// static/js/voice_client.js
// Shared voice client module for LadyLinux.
// Manages: /ws/voice connection, browser STT, event dispatch to
//          console and widget renderers, browser TTS playback.
// Phase 1: browser SpeechRecognition → text → WS.
// Phase 2: swap STT source; WS contract unchanged.

(function () {
  "use strict";

  // ── WebSocket state ────────────────────────────────────────────────────
  let ws = null;
  let wsReady = false;
  const WS_URL = `ws://${location.host}/ws/voice`;
  const RECONNECT_DELAY_MS = 3000;

  // ── Recording state per source ─────────────────────────────────────────
  // States: idle | listening | processing | speaking | error
  const state = { console: "idle", widget: "idle" };

  // ── Browser SpeechRecognition ──────────────────────────────────────────
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null; // created fresh per session

  // ── Connect / reconnect ────────────────────────────────────────────────
  function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      wsReady = true;
      console.info("[voice] WS connected");
    };

    ws.onclose = () => {
      wsReady = false;
      console.warn("[voice] WS closed — reconnecting in", RECONNECT_DELAY_MS, "ms");
      setTimeout(connect, RECONNECT_DELAY_MS);
    };

    ws.onerror = (err) => {
      console.error("[voice] WS error", err);
    };

    ws.onmessage = (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      handleServerEvent(msg);
    };
  }

  // ── Handle events from backend ─────────────────────────────────────────
  function handleServerEvent(msg) {
    const { event, source, text } = msg;

    switch (event) {
      case "voice_ready":
        // Connection handshake confirmed
        break;

      case "stt_final":
        // Show the confirmed transcript in the appropriate surface
        renderUserTranscript(source, text);
        setState(source, "processing");
        break;

      case "assistant_final":
        // Render Lady's response in the appropriate surface
        renderAssistantResponse(source, text);
        setState(source, "speaking");
        // Browser TTS playback (Phase 1 — no audio_b64 yet)
        speakText(text, source);
        break;

      case "tts_started":
        setState(source, "speaking");
        break;

      case "tts_finished":
        setState(source, "idle");
        break;

      case "tts_audio":
        // Phase 2: play server-generated audio
        if (msg.audio_b64 && msg.mime) {
          const audio = new Audio(`data:${msg.mime};base64,${msg.audio_b64}`);
          audio.onended = () => setState(source, "idle");
          audio.onerror = () => setState(source, "idle");
          audio.play().catch(console.error);
        }
        break;

      case "voice_error":
        console.error("[voice] server error:", msg.message);
        setState(source, "error");
        // Reset to idle after brief delay so user can retry
        setTimeout(() => setState(source, "idle"), 2500);
        break;
    }
  }

  // ── Render into console surfaces ───────────────────────────────────────
  function renderUserTranscript(source, text) {
    if (source === "console") {
      // Fill the input box and trigger the existing form submit path
      const input = document.getElementById("ucsPrompt");
      if (input) {
        input.value = text;
        // Dispatch a submit event so chat.js handles it identically to typing
        const form = document.getElementById("ucsChatForm");
        if (form) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
    } else if (source === "widget") {
      // Append user bubble to widget chat history
      appendWidgetMessage("user", text);
    }
  }

  function renderAssistantResponse(source, text) {
    if (source === "widget") {
      // Widget renders its own bubble; console response comes via chat.js pipeline
      appendWidgetMessage("lady", text);
    }
    // Console: response already rendered by the chat.js stream pipeline
    // triggered when renderUserTranscript submitted the form above
  }

  // ── Widget message append ──────────────────────────────────────────────
  function appendWidgetMessage(role, text) {
    const output = document.getElementById("lady-response");
    if (!output) return;

    const div = document.createElement("div");
    div.className =
      role === "user"
        ? "lady-message lady-message-user"
        : "lady-message";
    div.textContent = role === "user" ? `You: ${text}` : `Lady Linux: ${text}`;
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
  }

  // ── Browser TTS fallback (Phase 1) ────────────────────────────────────
  function speakText(text, source) {
    if (!window.speechSynthesis) {
      setState(source, "idle");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setState(source, "idle");
    utterance.onerror = () => setState(source, "idle");
    window.speechSynthesis.speak(utterance);
  }

  // ── State management + UI reflection ──────────────────────────────────
  function setState(source, newState) {
    state[source] = newState;
    updateMicButton(source, newState);
  }

  function updateMicButton(source, voiceState) {
    // Mic buttons carry data-voice-source="console" | "widget"
    const btn = document.querySelector(`[data-mic-btn][data-voice-source="${source}"]`);
    if (!btn) return;

    // Remove all state classes, apply current
    btn.classList.remove("mic-listening", "mic-processing", "mic-speaking", "mic-error");

    const iconEl = btn.querySelector("i");

    switch (voiceState) {
      case "listening":
        btn.classList.add("mic-listening");
        if (iconEl) iconEl.className = "bi bi-mic-fill";
        btn.title = "Listening…";
        break;
      case "processing":
        btn.classList.add("mic-processing");
        if (iconEl) iconEl.className = "bi bi-hourglass-split";
        btn.title = "Processing…";
        break;
      case "speaking":
        btn.classList.add("mic-speaking");
        if (iconEl) iconEl.className = "bi bi-volume-up-fill";
        btn.title = "Speaking…";
        break;
      case "error":
        btn.classList.add("mic-error");
        if (iconEl) iconEl.className = "bi bi-mic-mute-fill";
        btn.title = "Voice error — click to retry";
        break;
      default: // idle
        if (iconEl) iconEl.className = "bi bi-mic";
        btn.title = "Start voice input";
    }
  }

  // ── Start / stop recording ─────────────────────────────────────────────
  function startVoice(source) {
    if (state[source] !== "idle") return; // prevent double-start

    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    // Request mic permission implicitly via SpeechRecognition
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true; // show partials in input field
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => {
      setState(source, "listening");
      // Notify backend session started
      send({ event: "voice_start", source });
    };

    recognition.onresult = (evt) => {
      const result = evt.results[evt.results.length - 1];
      const transcript = result[0].transcript;
      const isFinal = result.isFinal;

      if (source === "console") {
        // Live partial feedback: fill input while listening
        const input = document.getElementById("ucsPrompt");
        if (input) input.value = transcript;
      }

      if (isFinal) {
        // Send confirmed transcript to backend for processing
        send({ event: "voice_text_final", text: transcript, source });
        send({ event: "voice_stop", source });
      }
    };

    recognition.onerror = (evt) => {
      console.error("[voice] STT error:", evt.error);
      if (evt.error === "not-allowed") {
        alert("Microphone permission denied. Please allow mic access and try again.");
      }
      setState(source, "error");
      setTimeout(() => setState(source, "idle"), 2500);
    };

    recognition.onend = () => {
      // Guard: if still listening when recognition ends (e.g. silence timeout),
      // reset state but don't double-send voice_stop
      if (state[source] === "listening") {
        setState(source, "idle");
      }
    };

    recognition.start();
  }

  function stopVoice(source) {
    if (recognition) {
      recognition.stop();
      recognition = null;
    }
    send({ event: "voice_stop", source });
    setState(source, "idle");
  }

  // ── WS send helper ─────────────────────────────────────────────────────
  function send(payload) {
    if (ws && wsReady) {
      ws.send(JSON.stringify(payload));
    }
  }

  // ── Mic button click handler (shared for both surfaces) ─────────────────
  function handleMicClick(btn) {
    const source = btn.getAttribute("data-voice-source") || "console";
    if (state[source] === "idle" || state[source] === "error") {
      startVoice(source);
    } else if (state[source] === "listening") {
      stopVoice(source);
    }
    // Ignore clicks during processing/speaking
  }

  // ── Init ───────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    connect();

    // Wire all mic buttons (console + widget) via delegation
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-mic-btn]");
      if (btn) handleMicClick(btn);
    });
  });

  // ── Public API (optional, for testing from console) ────────────────────
  window.voiceClient = { startVoice, stopVoice, getState: () => ({ ...state }) };
})();
