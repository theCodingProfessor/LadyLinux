from __future__ import annotations

from api_layer.utils.command_runner import run_command
from api_layer.utils.validators import validate_package_name


class AptPackageBackend:
    """APT-only package manager backend.

    This backend is intentionally isolated so future managers (dnf/pacman/etc.)
    can implement the same method contract and be swapped by configuration.
    """

    name = "apt"

    def search(self, query: str) -> dict:
        term = validate_package_name(query)
        result = run_command(["apt-cache", "search", term])
        payload = result.model_dump()
        payload["manager"] = self.name
        payload["query"] = term
        payload["packages"] = result.stdout.splitlines()
        return payload

    def installed(self, query: str) -> dict:
        term = validate_package_name(query)
        result = run_command(["dpkg-query", "-W", "-f=${Package} ${Version}\\n"])
        lines = [line for line in result.stdout.splitlines() if term in line.lower()]
        payload = result.model_dump()
        payload["manager"] = self.name
        payload["query"] = term
        payload["packages"] = lines
        return payload

    def install(self, package: str) -> dict:
        """Package installation is disabled.

        apt-get requires root privileges. The ladylinux service user does
        not have sudo rights and privilege escalation is not configured.
        Install packages manually or via a privileged session.
        """
        pkg = validate_package_name(package)
        return {
            "ok": False,
            "manager": self.name,
            "package": pkg,
            "stdout": "",
            "stderr": "Package installation is not available through the API. "
                      "Install packages manually with: sudo apt-get install <package>",
            "returncode": 1,
            "not_implemented": True,
        }


backend = AptPackageBackend()


def search_packages(query: str) -> dict:
    return backend.search(query)


def installed_packages(query: str) -> dict:
    return backend.installed(query)


def install_package(package: str) -> dict:
    return backend.install(package)
