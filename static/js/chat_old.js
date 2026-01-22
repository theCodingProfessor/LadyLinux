const chatForm = document.getElementById('chatForm');
const promptInput = document.getElementById('prompt');
const chatResponse = document.getElementById('chatResponse');

async function streamToElement(url, payload, targetElement) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
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

// ---- INDEX PAGE ----
document.addEventListener("DOMContentLoaded", () => {
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
//    const firewallForm = document.getElementById("firewallForm");
//    if (firewallForm) {
//        const firewallPrompt = document.getElementById("firewallPrompt");
//        const firewallResponse = document.getElementById("firewallResponse");
//
//        firewallForm.addEventListener("submit", async (e) => {
//            e.preventDefault();
//            const prompt = firewallPrompt.value.trim();
//            if (!prompt) return;
//
//            firewallResponse.innerHTML = `<p><strong>You:</strong> ${prompt}</p>`;
//            await streamToElement("/ask_firewall", { prompt }, firewallResponse);
//        });
//    }
//

document.addEventListener("DOMContentLoaded", () => {
  const firewallForm = document.getElementById("firewallForm");
  if (!firewallForm) return;

  const firewallPrompt = document.getElementById("firewallPrompt");
  const firewallResponse = document.getElementById("firewallResponse");
  const firewallJSON = document.getElementById("firewallJSON");

  firewallForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const prompt = firewallPrompt.value.trim();
    if (!prompt) return;

    // Clear old data
    firewallResponse.innerHTML = `<p><strong>You:</strong> ${prompt}</p>`;
    firewallJSON.textContent = "Loading firewall data...";

    try {
      const res = await fetch("/ask_firewall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        firewallResponse.innerHTML += `<p><strong>Lady Linux:</strong> Server returned error (${res.status}).</p>`;
        return;
      }

      const data = await res.json();

      // Display LLM answer
      firewallResponse.innerHTML += `<p><strong>Lady Linux:</strong> ${data.output}</p>`;

      // Display parsed firewall JSON in <pre> tag
      firewallJSON.textContent = JSON.stringify(data.firewall_json, null, 2);

    } catch (err) {
      firewallResponse.innerHTML += `<p><strong>Lady Linux:</strong> Error fetching response: ${err.message}</p>`;
      firewallJSON.textContent = "";
    }
  });
});
});


