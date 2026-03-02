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

function tryHandleUiCommand(fullText) {
  try {
    const match = fullText.match(/(?:^|\n)(LL_UI:\s*(\{[^\n]*\}))(?=\n|$)/);
    if (!match) {
      return { handled: false, cleanText: fullText };
    }

    const payload = JSON.parse(match[2]);
    if (
      payload.action === "set_theme" &&
      typeof payload.theme === "string" &&
      KNOWN_THEME_KEYS.includes(payload.theme) &&
      typeof window.applyTheme === "function"
    ) {
      window.applyTheme(payload.theme);
      return {
        handled: true,
        cleanText: fullText.replace(match[1], "").replace(/\n{3,}/g, "\n\n").trim(),
      };
    }
  } catch (err) {
    return { handled: false, cleanText: fullText };
  }

  return { handled: false, cleanText: fullText };
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
    const uiState = tryHandleUiCommand(result);
    assistantReply.innerHTML = `<strong>Lady Linux:</strong> ${uiState.cleanText}`;
    targetElement.scrollTop = targetElement.scrollHeight;
  }

  const uiState = tryHandleUiCommand(result);
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
