# Lady Linux: System Architecture

Lady Linux is organized into clearly defined layers to ensure safety, inspectability, and extensibility.

---

## 1. Kernel & OS Base

- Linux kernel
- Minimal userland
- Standard package manager
- Python 3 included by default

**Design Goals**
- Small attack surface
- Predictable configuration locations
- Familiar Linux conventions

---

## 2. Abstraction & Permissions Layer

A Python-based service layer that mediates all system access.

Responsibilities:
- Controlled file access
- Getter/setter APIs for system state
- Permission enforcement
- Audit logging

No direct LLM access to the OS exists outside this layer.

---

## 3. LLM Integration Layer

A local Large Language Model operating under strict constraints.

Capabilities:
- Read-only inspection (by default)
- Explanation of configuration files
- Comparison against known standards
- Proposal of changes (not execution)

Constraints:
- No autonomous actions
- No silent writes
- Human approval required for mutations

---

## 4. Data Representation Layer

Responsible for:
- Mapping user data types
- Representing system and personal data consistently
- Supporting vectorization for inspection
- Tracking provenance and context

---

## 5. Security & Audit Layer

Cross-cutting concerns:
- Least privilege enforcement
- Change logs
- Rollback mechanisms
- Alerting on anomalous requests

---

## 6. User Interface / HCI Layer

Initial implementations may include:
- CLI-based conversational interface
- Minimal GUI
- Educational walkthroughs

Primary design goal:
> Make complex systems understandable to non-experts.

---

## Architectural Non-Goals (v0.1)

- Full mobile OS replacement
- Autonomous agents
- Cloud-dependent LLMs
- Closed-source components
