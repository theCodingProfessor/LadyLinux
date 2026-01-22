


// ===== Shared helper: Stream model output to an element =====
//async function streamToElement(url, payload, targetElement) {
//  const response = await fetch(url, {
//    method: "POST",
//    headers: { "Content-Type": "application/json" },
//    body: JSON.stringify(payload),
//  });
//
//  if (!response.body) {
//    targetElement.innerHTML += "<p><strong>Error:</strong> No response body.</p>";
//    return;
//  }
//
//  const reader = response.body.getReader();
//  const decoder = new TextDecoder();
//  let result = "";
//
//  while (true) {
//    const { done, value } = await reader.read();
//    if (done) break;
//    result += decoder.decode(value, { stream: true });
//    targetElement.innerHTML = `<p><strong>Lady Linux:</strong> ${result}</p>`;
//    targetElement.scrollTop = targetElement.scrollHeight;
//  }
//} 
//
// ===== Page logic =====
//document.addEventListener("DOMContentLoaded", () => {
//
//  // ---- INDEX PAGE ----
//  const chatForm = document.getElementById("chatForm");
//  if (chatForm) {
//    const promptInput = document.getElementById("prompt");
//    const chatResponse = document.getElementById("chatResponse");
//
//    chatForm.addEventListener("submit", async (e) => {
//      e.preventDefault();
//      const userMessage = promptInput.value.trim();
//      if (!userMessage) return;
//
//      chatResponse.innerHTML += `<p><strong>You:</strong> ${userMessage}</p>`;
//      promptInput.value = "";
//
//      await streamToElement("/ask_phi3", { prompt: userMessage }, chatResponse);
//    });
//  }
//
// ---- FIREWALL PAGE ----
//const firewallForm = document.getElementById("firewallForm");
//if (firewallForm) {
//  const firewallPrompt = document.getElementById("firewallPrompt");
//  const firewallResponse = document.getElementById("firewallResponse");
//  const firewallJSON = document.getElementById("firewallJSON");
//
//  firewallForm.addEventListener("submit", async (e) => {
//    e.preventDefault();
//    const prompt = firewallPrompt.value.trim();
//    if (!prompt) return;
//
//    // Reset previous output
//    firewallResponse.innerHTML = `<p><strong>You:</strong> ${prompt}</p>`;
//    firewallJSON.textContent = "Loading firewall data...";
//
//    try {
//      const res = await fetch("/ask_firewall", {
//        method: "POST",
//        headers: { "Content-Type": "application/json" },
//        body: JSON.stringify({ prompt }),
//      });
//
//      if (!res.ok) {
//        firewallResponse.innerHTML += `<p><strong>Lady Linux:</strong> Server returned error (${res.status}).</p>`;
//        firewallJSON.textContent = "";
//        return;
//      }
//
//      const data = await res.json();
//
//      // ✅ Lady Linux’s readable text response
//      let output = data.output;
//      if (typeof output !== "string") {
//        output = JSON.stringify(output, null, 2);
//      }
//      firewallResponse.innerHTML += `<p><strong>Lady Linux:</strong> ${output}</p>`;
//
//      // ✅ Show formatted firewall JSON below
//      const fwData = data.firewall_json || {};
//      firewallJSON.textContent = JSON.stringify(fwData, null, 2);
//    } catch (err) {
//      firewallResponse.innerHTML += `<p><strong>Lady Linux:</strong> Error: ${err.message}</p>`;
//      firewallJSON.textContent = "";
//    }
//  });
//}
//
// ---- FIREWALL PAGE ----
//const firewallForm = document.getElementById("firewallForm");
//if (firewallForm) {
//  const firewallPrompt = document.getElementById("firewallPrompt");
//  const firewallResponse = document.getElementById("firewallResponse");
//  const firewallTableContainer = document.getElementById("firewallTableContainer");
//
//  firewallForm.addEventListener("submit", async (e) => {
//    e.preventDefault();
//    const prompt = firewallPrompt.value.trim();
//    if (!prompt) return;
//
//    // Reset UI
//    firewallResponse.innerHTML = `<p><strong>You:</strong> ${prompt}</p>`;
//    firewallTableContainer.innerHTML = `<div class="text-muted">Loading firewall data...</div>`;
//
//    try {
//      const res = await fetch("/ask_firewall", {
//        method: "POST",
//        headers: { "Content-Type": "application/json" },
//        body: JSON.stringify({ prompt }),
//      });
//
//      if (!res.ok) {
//        firewallResponse.innerHTML += `<p><strong>Lady Linux:</strong> Server returned error (${res.status}).</p>`;
//        return;
//      }
//
//      // ✅ Properly parse JSON response
//      const data = await res.json();
//
//      // ✅ Ensure 'output' is treated as clean text, not raw JSON
//      const textResponse =
//        typeof data.output === "string"
//          ? data.output
//          : JSON.stringify(data.output, null, 2);
//
//      firewallResponse.innerHTML += `<p><strong>Lady Linux:</strong> ${textResponse}</p>`;
//
//      // ✅ Handle structured firewall JSON
//      const fw = data.firewall_json;
//      if (!fw) {
//        firewallTableContainer.innerHTML = `<div class="alert alert-warning">No structured firewall data returned.</div>`;
//        return;
//      }
//
//      const rules = fw.rules || [];
//      if (rules.length === 0) {
//        firewallTableContainer.innerHTML = `<div class="alert alert-warning">No firewall rules found.</div>`;
//      } else {
//        let tableHTML = `
//          <table class="table table-striped table-bordered table-sm align-middle">
//            <thead class="table-dark">
//              <tr>
//                <th>Port</th>
//                <th>Action</th>
//                <th>From</th>
//                <th>Protocol</th>
//              </tr>
//            </thead>
//            <tbody>
//        `;
//        for (const rule of rules) {
//          tableHTML += `
//            <tr>
//              <td>${rule.port || ""}</td>
//              <td>${rule.action || ""}</td>
//              <td>${rule.from || ""}</td>
//              <td>${rule.protocol || ""}</td>
//            </tr>
//          `;
//        }
//        tableHTML += `
//            </tbody>
//          </table>
//          <div class="mt-3">
//            <strong>Status:</strong> ${fw.status || "unknown"}<br>
//            <strong>Logging:</strong> ${fw.logging || "unknown"}<br>
//            <strong>Defaults:</strong> <pre class="d-inline">${JSON.stringify(fw.defaults || {}, null, 2)}</pre><br>
//            <strong>New profiles:</strong> ${fw.new_profiles || "none"}
//          </div>
//        `;
//        firewallTableContainer.innerHTML = tableHTML;
//      }
//    } catch (err) {
//      firewallResponse.innerHTML += `<p><strong>Lady Linux:</strong> Error fetching response: ${err.message}</p>`;
//      firewallTableContainer.innerHTML = "";
//    }
//  });
//}
//
//});
//
//
// ---- FIREWALL PAGE ----
//const firewallForm = document.getElementById("firewallForm");
//if (firewallForm) {
//  const firewallPrompt = document.getElementById("firewallPrompt");
//  const firewallResponse = document.getElementById("firewallResponse");
//  const firewallTableContainer = document.getElementById("firewallTableContainer");
//
//  firewallForm.addEventListener("submit", async (e) => {
//    e.preventDefault();
//    const prompt = firewallPrompt.value.trim();
//    if (!prompt) return;
//
//    // Reset UI
//    firewallResponse.innerHTML = `<p><strong>You:</strong> ${prompt}</p>`;
//    firewallTableContainer.innerHTML = `<div class="text-muted">Loading firewall data...</div>`;
//
//    try {
//      const res = await fetch("/ask_firewall", {
//        method: "POST",
//        headers: { "Content-Type": "application/json" },
//        body: JSON.stringify({ prompt }),
//      });
//
//      if (!res.ok) {
//        firewallResponse.innerHTML += `<p><strong>Lady Linux:</strong> Server returned error (${res.status}).</p>`;
//        return;
//      }
//
//      const data = await res.json();
//
//      // Display LLM answer
//      firewallResponse.innerHTML += `<p><strong>Lady Linux:</strong> ${data.output}</p>`;
//
//      // Display structured firewall rules as a table
//      const fw = data.firewall_json || {};
//      const rules = fw.rules || [];
//
//      if (rules.length === 0) {
//        firewallTableContainer.innerHTML = `<div class="alert alert-warning">No firewall rules found.</div>`;
//      } else {
//        let tableHTML = `
//          <table class="table table-striped table-bordered table-sm align-middle">
//            <thead class="table-dark">
//              <tr>
//                <th>Port</th>
//                <th>Action</th>
//                <th>From</th>
//                <th>Protocol</th>
//              </tr>
//            </thead>
//            <tbody>
//        `;
//        for (const rule of rules) {
//          tableHTML += `
//            <tr>
//              <td>${rule.port || ""}</td>
//              <td>${rule.action || ""}</td>
//              <td>${rule.from || ""}</td>
//              <td>${rule.protocol || ""}</td>
//            </tr>
//          `;
//        }
//        tableHTML += `
//            </tbody>
//          </table>
//          <div class="mt-3">
//            <strong>Status:</strong> ${fw.status || "unknown"}<br>
//            <strong>Logging:</strong> ${fw.logging || "unknown"}<br>
//            <strong>Defaults:</strong> ${JSON.stringify(fw.defaults || {}, null, 2)}<br>
//            <strong>New profiles:</strong> ${fw.new_profiles || "none"}
//          </div>
//        `;
//        firewallTableContainer.innerHTML = tableHTML;
//      }
//    } catch (err) {
//      firewallResponse.innerHTML += `<p><strong>Lady Linux:</strong> Error fetching response: ${err.message}</p>`;
//      firewallTableContainer.innerHTML = "";
//    }
//  });
//}


//  // ---- FIREWALL PAGE ----
//  const firewallForm = document.getElementById("firewallForm");
//  if (firewallForm) {
//    const firewallPrompt = document.getElementById("firewallPrompt");
//    const firewallResponse = document.getElementById("firewallResponse");
//    const firewallJSON = document.getElementById("firewallJSON");
//
//    firewallForm.addEventListener("submit", async (e) => {
//      e.preventDefault();
//      const prompt = firewallPrompt.value.trim();
//      if (!prompt) return;
//
//      // Clear old data
//      firewallResponse.innerHTML = `<p><strong>You:</strong> ${prompt}</p>`;
//      firewallJSON.textContent = "Loading firewall data...";
//
//      try {
//        const res = await fetch("/ask_firewall", {
//          method: "POST",
//          headers: { "Content-Type": "application/json" },
//          body: JSON.stringify({ prompt }),
//        });
//
//        if (!res.ok) {
//          firewallResponse.innerHTML += `<p><strong>Lady Linux:</strong> Server returned error (${res.status}).</p>`;
//          return;
//        }
//
//        const data = await res.json();
//
//        // Display LLM answer
//        firewallResponse.innerHTML += `<p><strong>Lady Linux:</strong> ${data.output}</p>`;
//
//        // Display parsed firewall JSON in <pre> tag
//        firewallJSON.textContent = JSON.stringify(data.firewall_json, null, 2);
//
//      } catch (err) {
//        firewallResponse.innerHTML += `<p><strong>Lady Linux:</strong> Error fetching response: ${err.message}</p>`;
//        firewallJSON.textContent = "";
//      }
//    });
//  }

