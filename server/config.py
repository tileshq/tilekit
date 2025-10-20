from pathlib import Path
import os
PORT = 6969
MODEL_ID = "driaforall/mem-agent"

prompt_path = Path(__file__).parent / "system_prompt.txt"
MEMORY_PATH = os.path.expanduser("~") + "/tiles_memory"

with open(prompt_path, "r", encoding="utf-8") as f:
    SYSTEM_PROMPT = f.read().strip()
