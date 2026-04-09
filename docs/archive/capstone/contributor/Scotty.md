// New Style Sheet //

/* ===== Global Reset ===== */

body {
    margin: 0;
    padding: 0;
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    background: linear-gradient(135deg, #0f172a, #111827, #1e1b4b);
    background-attachment: fixed;
    color: #e5e7eb;
}

/* ===== Container ===== */
.container {
    max-width: 800px;
    margin-top: 60px;
}

/* ===== Accent Gradient Text ===== */
.accent {
    font-size: 2.5rem;
    font-weight: 700;
    background: linear-gradient(90deg, #22d3ee, #a78bfa, #ec4899);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

/* ===== Response Box ===== */
.response-box {
    margin-top: 20px;
    padding: 20px;
    min-height: 120px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    transition: all 0.3s ease;
}

/* Subtle glow on hover */
.response-box:hover {
    border-color: rgba(167, 139, 250, 0.6);
    box-shadow: 0 0 20px rgba(167, 139, 250, 0.3);
}

/* ===== Input Styling ===== */
.form-control {
    background-color: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #fff;
    border-radius: 12px;
    padding: 12px;
}

.form-control:focus {
    background-color: rgba(255, 255, 255, 0.1);
    border-color: #a78bfa;
    box-shadow: 0 0 0 0.2rem rgba(167, 139, 250, 0.25);
    color: #fff;
}

/* Placeholder color */
.form-control::placeholder {
    color: #9ca3af;
}

/* ===== Gradient Button ===== */
.btn-accent {
    background: linear-gradient(90deg, #22d3ee, #a78bfa, #ec4899);
    border: none;
    color: white;
    font-weight: 600;
    border-radius: 12px;
    padding: 10px 20px;
    transition: all 0.3s ease;
}

.btn-accent:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(167, 139, 250, 0.4);
    opacity: 0.9;
}

/* ===== Label ===== */
.form-label {
    margin-top: 20px;
    font-weight: 500;
    color: #cbd5e1;
}
