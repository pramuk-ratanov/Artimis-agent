"""
Artimis Agent — Local Model Manager

Hardware detection, model recommendation, and local model download.
Runs on laptop-grade hardware. Detects RAM, GPU, and recommends
appropriately-sized quantized models.
"""

import os
import json
import subprocess
from typing import Optional


# ─── Hardware Detection ────────────────────────────────────

def detect_hardware() -> dict:
    """Detect the host machine's hardware capabilities."""
    info = {
        "ram_gb": 0,
        "ram_available_gb": 0,
        "gpu": None,
        "vram_gb": None,
        "cpu_cores": os.cpu_count() or 4,
        "os": "",
        "disk_free_gb": 0,
    }

    # OS detection
    if os.path.exists("/proc/meminfo"):
        info["os"] = "linux"
    elif os.path.exists("/System/Library"):
        info["os"] = "macos"
    else:
        info["os"] = "unknown"

    # RAM detection (Linux)
    try:
        with open("/proc/meminfo") as f:
            meminfo = f.read()
        import re
        total = re.search(r"MemTotal:\s+(\d+)", meminfo)
        available = re.search(r"MemAvailable:\s+(\d+)", meminfo)
        if total:
            info["ram_gb"] = round(int(total.group(1)) / 1024 / 1024, 1)
        if available:
            info["ram_available_gb"] = round(int(available.group(1)) / 1024 / 1024, 1)
    except Exception:
        pass

    # GPU detection (NVIDIA via nvidia-smi)
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            parts = result.stdout.strip().split(",")
            if len(parts) >= 2:
                info["gpu"] = parts[0].strip()
                vram_str = parts[1].strip().replace(" MiB", "")
                info["vram_gb"] = round(int(vram_str) / 1024, 1)
    except Exception:
        pass

    # GPU detection (Apple Silicon)
    if info["os"] == "macos" and not info["gpu"]:
        try:
            result = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"],
                                    capture_output=True, text=True, timeout=5)
            cpu = result.stdout.strip()
            if "Apple" in cpu:
                info["gpu"] = "Apple Silicon (integrated)"
                info["vram_gb"] = info["ram_gb"] * 0.7  # ~70% of unified memory usable
        except Exception:
            pass

    # Disk free
    try:
        stat = os.statvfs(os.path.expanduser("~"))
        info["disk_free_gb"] = round((stat.f_frsize * stat.f_bavail) / (1024**3), 1)
    except Exception:
        pass

    return info


# ─── Model Recommendation ──────────────────────────────────

MODEL_RECOMMENDATIONS = [
    # (min_ram_gb, model_name, size_gb, quant, description)
    (4, "phi-3-mini", 2.0, "Q4_K_M", "Microsoft Phi-3 Mini — good for basic tasks on 4GB machines"),
    (6, "gemma-2-2b", 1.5, "Q4_K_M", "Google Gemma 2 2B — fast, efficient, good quality for size"),
    (8, "llama-3.2-3b", 2.5, "Q4_K_M", "Meta Llama 3.2 3B — solid all-rounder for 8GB machines"),
    (12, "mistral-7b", 4.5, "Q4_K_M", "Mistral 7B — strong reasoning, good for research tasks"),
    (16, "llama-3.1-8b", 5.5, "Q4_K_M", "Meta Llama 3.1 8B — excellent balance of quality and speed"),
    (24, "llama-3.1-8b", 6.0, "Q5_K_M", "Meta Llama 3.1 8B (Q5) — higher quality for more RAM"),
    (32, "mixtral-8x7b", 25.0, "Q4_K_M", "Mixtral 8x7B — near-70B quality at fraction of cost"),
    (48, "llama-3.1-70b", 40.0, "Q4_K_M", "Meta Llama 3.1 70B — top-tier quality, needs serious hardware"),
]


def recommend_models(hardware: Optional[dict] = None) -> list[dict]:
    """Recommend local models based on detected hardware."""
    if hardware is None:
        hardware = detect_hardware()

    available_ram = hardware["ram_gb"] or hardware.get("ram_available_gb", 0)
    # Reserve 3GB for system + Artimis
    usable_ram = max(available_ram - 3, 0)

    recommendations = []
    for min_ram, name, size, quant, desc in MODEL_RECOMMENDATIONS:
        if usable_ram >= min_ram:
            recommendations.append({
                "name": name,
                "size_gb": size,
                "quantization": quant,
                "description": desc,
                "fits": size <= usable_ram * 0.85,
                "ollama_cmd": f"ollama pull {name}:latest",
                "hf_url": f"https://huggingface.co/bartowski/{name}-GGUF",
            })

    # Sort by quality (most capable first) and mark the best fit
    recommendations.reverse()
    if recommendations:
        recommendations[0]["recommended"] = True

    return recommendations


def check_ollama() -> bool:
    """Check if Ollama is installed."""
    try:
        result = subprocess.run(["ollama", "list"], capture_output=True, text=True, timeout=5)
        return result.returncode == 0
    except Exception:
        return False


def list_installed_models() -> list[dict]:
    """List models installed via Ollama."""
    if not check_ollama():
        return []

    try:
        result = subprocess.run(
            ["ollama", "list"], capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            return []

        models = []
        lines = result.stdout.strip().split("\n")[1:]  # Skip header
        for line in lines:
            parts = line.split()
            if len(parts) >= 4:
                models.append({
                    "name": parts[0],
                    "id": parts[1][:12],
                    "size": parts[2] + " " + parts[3],
                    "modified": " ".join(parts[4:]) if len(parts) > 4 else "",
                })
        return models
    except Exception:
        return []


def download_model(model_name: str, method: str = "ollama") -> dict:
    """
    Start downloading a model. Returns status dict.
    For Ollama: runs `ollama pull` in background.
    For HF: returns the URL for manual download.
    """
    if method == "ollama":
        if not check_ollama():
            return {
                "status": "error",
                "error": "Ollama not installed. Run: curl -fsSL https://ollama.com/install.sh | sh",
            }

        # Start download in background
        import threading
        def _pull():
            subprocess.run(
                ["ollama", "pull", model_name],
                capture_output=True, text=True, timeout=600
            )

        thread = threading.Thread(target=_pull, daemon=True)
        thread.start()

        return {
            "status": "downloading",
            "model": model_name,
            "method": "ollama",
            "note": "Download started in background. Check ollama list for progress.",
        }

    elif method == "hf":
        return {
            "status": "manual",
            "model": model_name,
            "method": "huggingface",
            "url": f"https://huggingface.co/bartowski/{model_name}-GGUF",
            "note": "Download the GGUF file and place it in ~/.artimis/models/",
        }

    return {"status": "error", "error": f"Unknown method: {method}"}
