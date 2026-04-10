/* =====================================================
   LADY LINUX - FLOATING MINI CONSOLE WIDGET
   ===================================================== */

/* Widget element bindings */
const input = document.getElementById("lady-input");
const output = document.getElementById("lady-response");

/* Widget chat behavior: reuse shared chat.js sendPrompt + parser pipeline */
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

    try {
      const sendPrompt = window.sendPrompt;
      if (typeof sendPrompt !== "function") {
        throw new Error("Chat transport unavailable");
      }

      const reply = await sendPrompt(prompt);

      if (typeof window.processAssistantReply === "function") {
        window.processAssistantReply(prompt, reply);
      }

      const replyMessage = document.createElement("div");
      replyMessage.className = "lady-message";
      replyMessage.textContent = `Lady Linux: ${reply}`;
      output.appendChild(replyMessage);
    } catch (err) {
      const errMessage = document.createElement("div");
      errMessage.className = "lady-message";
      errMessage.textContent = `Lady Linux: Request failed - ${err.message}`;
      output.appendChild(errMessage);
    }

    output.scrollTop = output.scrollHeight;
  });
}
