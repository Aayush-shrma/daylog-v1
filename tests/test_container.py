"""Container hardening: the runtime image must not run as root, and the build
context must not ship local secrets."""

import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCKERFILE = ROOT / "Dockerfile"
DOCKERIGNORE = ROOT / ".dockerignore"

ROOT_USERS = {"root", "0", "0:0"}


def test_dockerfile_runs_as_non_root():
    assert DOCKERFILE.is_file(), "Dockerfile is missing"
    users = [
        line.split(None, 1)[1].strip()
        for line in DOCKERFILE.read_text(encoding="utf-8").splitlines()
        if line.upper().startswith("USER ")
    ]
    assert users, "Dockerfile has no USER instruction (image runs as root)"
    assert users[-1] not in ROOT_USERS, f"final USER is {users[-1]!r}, not non-root"


def test_dockerignore_excludes_env_and_venv():
    entries = {
        line.strip() for line in DOCKERIGNORE.read_text(encoding="utf-8").splitlines()
    }
    assert ".env" in entries
    assert ".venv/" in entries
    assert "node_modules/" in entries
