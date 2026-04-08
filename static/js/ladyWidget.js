/* =====================================================
   LADY LINUX - FLOATING MINI CONSOLE WIDGET
   ===================================================== */

/* Widget element bindings */
const input = document.getElementById("lady-input");
const output = document.getElementById("lady-response");

function domainForCurrentPage() {
  const page = document.body?.getAttribute("data-page") || "index";
  const map = {
    firewall: "firewall",
    os: "os",
    users: "users",
    system: "os",
    index: null,
  };
  return Object.prototype.hasOwnProperty.call(map, page) ? map[page] : null;
}

async function sendPromptToRag(prompt) {
  const payload = {
    prompt,
    domain: domainForCurrentPage(),
    top_k: 6,
  };

  const response = await fetch("/ask_rag", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    return data?.output || JSON.stringify(data);
  }

  if (!response.body) {
    return await response.text();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fullText += decoder.decode(value, { stream: true });
  }

  fullText += decoder.decode();
  return fullText;
}

/* Widget chat behavior: direct RAG transport with page-aware filtering */
if (input && output) {
  input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;

    const prompt = input.value.trim();
    if (!prompt) return;

    input.value = "";

    const userMessage = document.createElement("div");
    userMessage.className = "lady-message lady-message-user";
    userMessage.textContent = `You: ${prompt}`;
    output.appendChild(userMessage);

    const replyMessage = document.createElement("div");
    replyMessage.className = "lady-message";
    replyMessage.textContent = "Lady Linux: Thinking...";
    output.appendChild(replyMessage);

    try {
      const reply = await sendPromptToRag(prompt);
      replyMessage.textContent = `Lady Linux: ${reply}`;

      if (typeof window.processAssistantReply === "function") {
        window.processAssistantReply(prompt, reply);
      }
    } catch (err) {
      replyMessage.textContent = `Lady Linux: Request failed - ${err.message}`;
    }

    output.scrollTop = output.scrollHeight;
  });
}
