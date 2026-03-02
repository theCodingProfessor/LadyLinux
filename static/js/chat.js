/* =====================================================
   LADY LINUX - AI / CHAT SYSTEM
   ===================================================== */

const KNOWN_THEME_KEYS = [
  "soft",
  "crimson",
  "glass",
  "terminal",
  "custom-1",
  "custom-2",
  "custom-3",
  "custom-4",
];

function stripUiSegments(fullText) {
  return fullText.replace(/LL_UI:\s*(\{[\s\S]*?\})/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function tryHandleUiCommand(fullText) {
  const match = fullText.match(/LL_UI:\s*(\{[\s\S]*?\})/);
  if (!match) {
    return { handled: false, cleanText: fullText };
  }

  const cleanText = stripUiSegments(fullText);

  try {
    const payload = JSON.parse(match[1]);
    if (
      payload.action === "set_theme" &&
      typeof payload.theme === "string" &&
      payload.theme.trim() &&
      KNOWN_THEME_KEYS.includes(payload.theme) &&
      typeof window.applyTheme === "function"
    ) {
      window.applyTheme(payload.theme);
      return { handled: true, cleanText };
    }
  } catch (err) {
    return { handled: false, cleanText };
  }

  return { handled: false, cleanText };
}

async function streamToElement(url, payload, targetElement) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const assistantReply = document.createElement("p");
  assistantReply.innerHTML = "<strong>Lady Linux:</strong> ";
  targetElement.appendChild(assistantReply);

  if (!response.body) {
    assistantReply.innerHTML = "<strong>Error:</strong> No response body.";
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = "";
  let uiHandled = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
    const uiState = uiHandled
      ? { handled: false, cleanText: stripUiSegments(result) }
      : tryHandleUiCommand(result);
    if (uiState.handled) {
      uiHandled = true;
    }
    assistantReply.innerHTML = `<strong>Lady Linux:</strong> ${uiState.cleanText}`;
    targetElement.scrollTop = targetElement.scrollHeight;
  }

  const uiState = uiHandled
    ? { handled: false, cleanText: stripUiSegments(result) }
    : tryHandleUiCommand(result);
  assistantReply.innerHTML = `<strong>Lady Linux:</strong> ${uiState.cleanText}`;
}

function initChat() {
  function revealResponse(targetElement) {
    if (!targetElement) return;

    targetElement.classList.remove("d-none", "hidden");

    const parentCard = targetElement.closest(".card");
    if (parentCard) {
      parentCard.classList.remove("d-none", "hidden");
    }
  }

  const chatForm = document.getElementById("chatForm");
  if (chatForm) {
    const promptInput = document.getElementById("prompt");
    const chatResponse = document.getElementById("chatResponse");

    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const userMessage = promptInput.value.trim();
      if (!userMessage) return;

      revealResponse(chatResponse);
      chatResponse.innerHTML += `<p><strong>You:</strong> ${userMessage}</p>`;
      promptInput.value = "";

      await streamToElement("/ask_phi3", { prompt: userMessage }, chatResponse);
    });
  }

  const firewallForm = document.getElementById("firewallForm");
  if (firewallForm) {
    const firewallPrompt = document.getElementById("firewallPrompt");
    const firewallResponse = document.getElementById("firewallResponse");
    const firewallJSON = document.getElementById("firewallJSON");

    firewallForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const prompt = firewallPrompt.value.trim();
      if (!prompt) return;

      revealResponse(firewallResponse);
      revealResponse(firewallJSON);
      firewallResponse.textContent = `You: ${prompt}\n\nLoading firewall data...`;

      if (firewallJSON) {
        firewallJSON.textContent = "Loading...";
      }

      try {
        const res = await fetch("/ask_firewall", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });

        const text = await res.text();
        firewallResponse.textContent = text;

        if (firewallJSON) {
          try {
            firewallJSON.textContent = JSON.stringify(JSON.parse(text), null, 2);
          } catch (err) {
            firewallJSON.textContent = text;
          }
        }
      } catch (err) {
        const message = `Lady Linux: Error - ${err.message}`;
        firewallResponse.textContent = message;
        if (firewallJSON) {
          firewallJSON.textContent = message;
        }
      }
    });
  }
}
