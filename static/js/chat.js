/* =====================================================
   LADY LINUX – AI / CHAT SYSTEM
   ===================================================== */

/* =====================================================
   STREAM HELPER (KEEP GLOBAL)
   ===================================================== */

async function streamToElement(url, payload, targetElement) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.body) {
    targetElement.innerHTML += "<p><strong>Error:</strong> No response body.</p>";
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
    targetElement.innerHTML = `<p><strong>Lady Linux:</strong> ${result}</p>`;
    targetElement.scrollTop = targetElement.scrollHeight;
  }
}

/* =====================================================
   INIT CHAT SYSTEM
   ===================================================== */

function initChat() {

  // ---- INDEX PAGE ----
  const chatForm = document.getElementById("chatForm");
  if (chatForm) {
    const promptInput = document.getElementById("prompt");
    const chatResponse = document.getElementById("chatResponse");

    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const userMessage = promptInput.value.trim();
      if (!userMessage) return;

      chatResponse.innerHTML += `<p><strong>You:</strong> ${userMessage}</p>`;
      promptInput.value = "";

      await streamToElement("/ask_phi3", { prompt: userMessage }, chatResponse);
    });
  }

  // ---- FIREWALL PAGE ----
  const firewallForm = document.getElementById("firewallForm");
  if (firewallForm) {
    const firewallPrompt = document.getElementById("firewallPrompt");
    const firewallResponse = document.getElementById("firewallResponse");

    firewallForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const prompt = firewallPrompt.value.trim();
      if (!prompt) return;

      firewallResponse.textContent = `You: ${prompt}\n\nLoading firewall data...`;

      try {
        const res = await fetch("/ask_firewall", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });

        const text = await res.text();
        firewallResponse.textContent = text;

      } catch (err) {
        firewallResponse.textContent = `Lady Linux: Error - ${err.message}`;
      }
    });
  }

}