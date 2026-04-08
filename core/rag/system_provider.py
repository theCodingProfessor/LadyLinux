"""
Live runtime system data provider.

This complements file-based system reads by collecting high-churn OS state on
demand so prompts can include current processes, services, and other telemetry.
"""

from __future__ import annotations

import shutil
import subprocess

import psutil


class SystemProvider:
    """Collect lightweight runtime snapshots for prompt-time grounding."""

    def get_processes(self) -> str:
        procs: list[str] = []
        for process in psutil.process_iter(["pid", "name", "status", "cpu_percent", "username"]):
            try:
                info = process.info
                procs.append(
                    f"{info['pid']:>6}  "
                    f"{str(info.get('username') or '-'):12.12}  "
                    f"{str(info.get('status') or '-'):8.8}  "
                    f"{info.get('name') or '-'}"
                )
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return "PID     USER          STATUS    NAME\n" + "\n".join(procs[:50])

    def get_services(self) -> str:
        if not shutil.which("systemctl"):
            return "systemctl is not available on this host."
        result = subprocess.run(
            ["systemctl", "list-units", "--type=service", "--state=running", "--no-pager", "--plain"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        return result.stdout.strip() or result.stderr.strip() or "No running services reported."

    def get_network(self) -> str:
        lines = ["INTERFACE        ADDRESSES"]
        for name, addrs in psutil.net_if_addrs().items():
            values = [addr.address for addr in addrs if getattr(addr, "address", None)]
            lines.append(f"{name:<15} {'; '.join(values[:4]) or '-'}")
        return "\n".join(lines[:21])

    def get_disk(self) -> str:
        usage = psutil.disk_usage("/")
        return (
            "PATH   TOTAL_GB  USED_GB  FREE_GB  PERCENT\n"
            f"/      {usage.total / (1024**3):>8.1f}  "
            f"{usage.used / (1024**3):>7.1f}  "
            f"{usage.free / (1024**3):>7.1f}  "
            f"{usage.percent:>6.1f}%"
        )

    def get_memory(self) -> str:
        memory = psutil.virtual_memory()
        swap = psutil.swap_memory()
        return (
            "TYPE     TOTAL_GB  USED_GB  FREE_GB  PERCENT\n"
            f"RAM      {memory.total / (1024**3):>8.1f}  "
            f"{memory.used / (1024**3):>7.1f}  "
            f"{memory.available / (1024**3):>7.1f}  "
            f"{memory.percent:>6.1f}%\n"
            f"SWAP     {swap.total / (1024**3):>8.1f}  "
            f"{swap.used / (1024**3):>7.1f}  "
            f"{swap.free / (1024**3):>7.1f}  "
            f"{swap.percent:>6.1f}%"
        )

    def _tail(self, path: str, lines: int = 50) -> str:
        try:
            result = subprocess.run(
                ["tail", "-n", str(lines), path],
                capture_output=True,
                text=True,
                timeout=3,
                check=False,
            )
            return result.stdout or f"No output from {path}"
        except Exception:
            return f"Could not read {path}"

    def snapshot(self, topics: list[str]) -> dict[str, str]:
        data: dict[str, str] = {}
        for topic in topics:
            if topic == "processes":
                data["processes"] = self.get_processes()
            elif topic == "services":
                data["services"] = self.get_services()
            elif topic == "network":
                data["network"] = self.get_network()
            elif topic == "disk":
                data["disk"] = self.get_disk()
            elif topic == "memory":
                data["memory"] = self.get_memory()
            elif topic == "logs":
                data["logs"] = self._tail("/var/log/syslog", lines=50)
            elif topic == "auth":
                data["auth"] = self._tail("/var/log/auth.log", lines=30)
        return data