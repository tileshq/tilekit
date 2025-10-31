# MIT License

# Copyright (c) 2025 The BROKE team 🦫

# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:

# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.

# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
import datetime
import json
import os
import shutil
import sys
from pathlib import Path

# Issue #31 hints reader
from .model_card import read_readme_front_matter, tokenizer_has_chat_template

DEFAULT_CACHE_ROOT = Path.home() / ".cache/huggingface"
CACHE_ROOT = Path(os.environ.get("HF_HOME", DEFAULT_CACHE_ROOT))
MODEL_CACHE = CACHE_ROOT / "hub"

# Global variable to track if warning was shown
_legacy_warning_shown = False

# Check for models in legacy location and warn user
_legacy_models = list(CACHE_ROOT.glob("models--*"))
_is_test_env = "test_cache" in str(CACHE_ROOT) or "PYTEST_CURRENT_TEST" in os.environ
if _legacy_models and not _legacy_warning_shown and not _is_test_env:
    print(f"\n⚠️  Found {len(_legacy_models)} models in legacy location: {CACHE_ROOT}")
    print(f"   Please move them to: {MODEL_CACHE}")
    print(f"   Command: mv {CACHE_ROOT}/models--* {MODEL_CACHE}/")
    print("   This warning will appear until models are moved.\n")
    _legacy_warning_shown = True


def hf_to_cache_dir(hf_name: str) -> str:
    if hf_name.startswith("models--"):
        return hf_name
    if "/" in hf_name:
        org, model = hf_name.split("/", 1)
        return f"models--{org}--{model}"
    else:
        return f"models--{hf_name}"

def cache_dir_to_hf(cache_name: str) -> str:
    if cache_name.startswith("models--"):
        remaining = cache_name[len("models--"):]
        if "--" in remaining:
            parts = remaining.split("--", 1)
            return f"{parts[0]}/{parts[1]}"
        else:
            return remaining
    return cache_name

def expand_model_name(model_name):
    if "/" in model_name:
        return model_name
    mlx_candidate = f"mlx-community/{model_name}"
    mlx_cache_dir = MODEL_CACHE / hf_to_cache_dir(mlx_candidate)
    if mlx_cache_dir.exists():
        return mlx_candidate
    common_mlx_patterns = [
        "Llama-", "Qwen", "Mistral", "Phi-", "Mixtral", "phi-", "deepseek"
    ]
    for pattern in common_mlx_patterns:
        if pattern in model_name:
            return f"mlx-community/{model_name}"
    return model_name

def find_matching_models(pattern):
    """Find models that match a partial pattern. Returns a list of (model_dir, hf_name) tuples."""
    all_models = [d for d in MODEL_CACHE.iterdir() if d.name.startswith("models--")]
    matches = []
    
    for model_dir in all_models:
        hf_name = cache_dir_to_hf(model_dir.name)
        # Check if the pattern appears in the model name (case insensitive)
        if pattern.lower() in hf_name.lower():
            matches.append((model_dir, hf_name))
    
    return matches

def hash_exists_in_local_cache(model_name, commit_hash):
    """Check if a specific commit hash exists in the local cache for a model.
    
    Supports both full hashes and short hash prefixes (local resolution only).
    
    Args:
        model_name: Full model name (e.g., 'mlx-community/Phi-3-mini-4k-instruct-4bit')
        commit_hash: Commit hash to check for (short or full)
    
    Returns:
        Full hash if exists in local cache, None otherwise
    """
    base_cache_dir = MODEL_CACHE / hf_to_cache_dir(model_name)
    if not base_cache_dir.exists():
        return None
    
    snapshots_dir = base_cache_dir / "snapshots"
    if not snapshots_dir.exists():
        return None
    
    # Check for exact match first (full hash)
    hash_dir = snapshots_dir / commit_hash
    if hash_dir.exists():
        return commit_hash
    
    # Check for short hash match (local resolution)
    if len(commit_hash) < 40:
        for snapshot_dir in snapshots_dir.iterdir():
            if snapshot_dir.is_dir() and snapshot_dir.name.startswith(commit_hash):
                return snapshot_dir.name  # Return full hash
    
    return None

def resolve_single_model(model_spec):
    """
    Resolve a model spec to a single model, supporting fuzzy matching.
    Returns (model_path, model_name, commit_hash) or (None, None, None) if failed.
    Prints appropriate error messages for ambiguous matches.
    """
    # Parse the model spec (handles @commit_hash syntax)
    model_name, commit_hash = parse_model_spec(model_spec)
    
    # Try exact match first
    base_cache_dir = MODEL_CACHE / hf_to_cache_dir(model_name)
    if base_cache_dir.exists():
        return get_model_path(model_spec)
    
    # Extract the base name (without @commit_hash) for fuzzy matching
    base_spec = model_spec.split('@')[0] if '@' in model_spec else model_spec
    
    # Try fuzzy matching
    matches = find_matching_models(base_spec)
    
    if not matches:
        print(f"No models found matching '{base_spec}'!")
        return None, None, None
    elif len(matches) == 1:
        # Unambiguous match - use the found model with the original commit hash (if any)
        found_model_dir, found_hf_name = matches[0]
        if commit_hash:
            resolved_spec = f"{found_hf_name}@{commit_hash}"
        else:
            resolved_spec = found_hf_name
        return get_model_path(resolved_spec)
    elif len(matches) > 1 and commit_hash:
        # Issue #13: Hash-based disambiguation for ambiguous model names
        for _model_dir, hf_name in matches:
            resolved_hash = hash_exists_in_local_cache(hf_name, commit_hash)
            if resolved_hash:
                resolved_spec = f"{hf_name}@{resolved_hash}"
                return get_model_path(resolved_spec)
        
        # Hash not found in any candidate model
        print(f"Hash '{commit_hash}' not found in any model matching '{base_spec}'")
        print("Available models:")
        for _, hf_name in sorted(matches, key=lambda x: x[1]):
            print(f"  {hf_name}")
        return None, None, None
    else:
        # Multiple matches without hash - show error with suggestions
        print(f"Multiple models match '{base_spec}'. Please be more specific:")
        for _, hf_name in sorted(matches, key=lambda x: x[1]):
            print(f"  {hf_name}")
        return None, None, None

def get_model_path(model_spec):
    model_name, commit_hash = parse_model_spec(model_spec)
    base_cache_dir = MODEL_CACHE / hf_to_cache_dir(model_name)
    print(base_cache_dir)
    if not base_cache_dir.exists():
        return None, model_name, commit_hash
    if commit_hash:
        hash_dir = base_cache_dir / "snapshots" / commit_hash
        if hash_dir.exists():
            return hash_dir, model_name, commit_hash
        else:
            return None, model_name, commit_hash
    snapshots_dir = base_cache_dir / "snapshots"
    if snapshots_dir.exists():
        snapshots = [d for d in snapshots_dir.iterdir() if d.is_dir()]
        if snapshots:
            latest = max(snapshots, key=lambda x: x.stat().st_mtime)
            return latest, model_name, latest.name
    # Return base_cache_dir for corrupted models so rm_model can handle them
    return base_cache_dir, model_name, commit_hash

def parse_model_spec(model_spec):
    if "@" in model_spec:
        model_name, commit_hash = model_spec.rsplit("@", 1)
        model_name = expand_model_name(model_name)
        return model_name, commit_hash
    model_name = expand_model_name(model_spec)
    return model_name, None

def get_model_size(model_path):
    if not model_path.exists():
        return "?"
    total_size = 0
    for file in model_path.rglob("*"):
        if file.is_file():
            total_size += file.stat().st_size
    if total_size >= 1_000_000_000:
        return f"{total_size / 1_000_000_000:.1f} GB"
    elif total_size >= 1_000_000:
        return f"{total_size / 1_000_000:.1f} MB"
    else:
        return f"{total_size / 1_000:.1f} KB"

def get_model_modified(model_path):
    if not model_path.exists():
        return "?"
    mtime = model_path.stat().st_mtime
    now = datetime.datetime.now()
    modified = datetime.datetime.fromtimestamp(mtime)
    diff = now - modified
    if diff.days > 0:
        return f"{diff.days} days ago"
    elif diff.seconds > 3600:
        hours = diff.seconds // 3600
        return f"{hours} hours ago"
    else:
        minutes = diff.seconds // 60
        return f"{minutes} minutes ago"

def detect_framework(model_path, hf_name):
    """Detect model framework with lenient hints (Issue #31)."""
    # 1) org hint
    if "mlx-community" in hf_name:
        return "MLX"

    # 2) README front matter: tags contains 'mlx' OR library_name == 'mlx'
    try:
        tags, pipeline, lib = read_readme_front_matter(Path(model_path))
        if (lib and lib.lower() == "mlx") or (tags and any((t or '').lower() == "mlx" for t in tags)):
            return "MLX"
    except Exception:
        pass

    # 3) Fallback by file types
    snapshots_dir = Path(model_path) / "snapshots"
    if not snapshots_dir.exists():
        return "Unknown"
    has_gguf = any(snapshots_dir.glob("*/*.gguf"))
    has_safetensors = any(snapshots_dir.glob("*/*.safetensors"))
    has_pytorch_bin = any(snapshots_dir.glob("*/pytorch_model.bin"))
    has_config = any(snapshots_dir.glob("*/*.json"))
    total_size = get_model_size(Path(model_path))
    try:
        size_mb = float(total_size.replace(" GB", "000").replace(" MB", "").replace(" KB", "0").replace(" ", ""))
    except Exception:
        size_mb = 0
    if has_gguf:
        return "GGUF"
    if size_mb < 10:
        return "Tokenizer"
    if (has_safetensors and has_config) or has_pytorch_bin:
        return "PyTorch"
    return "Unknown"


def detect_model_type(model_path, hf_name):
    """Detect model type with priority hints (Issue #31)."""
    # 1) tokenizer chat_template
    try:
        if tokenizer_has_chat_template(Path(model_path)):
            return "chat"
    except Exception:
        pass

    # 2) README hints
    try:
        tags, pipeline, _ = read_readme_front_matter(Path(model_path))
        tset = {t.lower() for t in (tags or [])}
        if pipeline == "text-generation" or any(k in tset for k in {"chat", "instruct"}):
            return "chat"
        if pipeline == "sentence-similarity" or any(k in tset for k in {"embedding", "embeddings"}):
            return "embedding"
    except Exception:
        pass

    # 3) Fallback by name
    name = str(hf_name).lower()
    if "instruct" in name or "chat" in name:
        return "chat"
    if "embed" in name:
        return "embedding"
    return "base"


def get_quantization_info(model_path):
    """Extract quantization information from model config."""
    try:
        config_path = Path(model_path) / "config.json"
        if not config_path.exists():
            return None
        with open(config_path) as f:
            cfg = json.load(f)
        return cfg.get("quantization")
    except Exception:
        return None

def get_model_hash(model_path):
    snapshots_dir = model_path / "snapshots"
    if not snapshots_dir.exists():
        return "--------"
    snapshots = [d for d in snapshots_dir.iterdir() if d.is_dir()]
    if not snapshots:
        return "--------"
    latest = max(snapshots, key=lambda x: x.stat().st_mtime)
    return latest.name[:8]

def is_model_healthy(model_spec):
    """Strict health check for 1.x (backport of #27 rules).

    Rules:
    - config.json must exist and be valid non-empty JSON object.
    - If a safetensors or PyTorch index exists, all referenced shards must exist, be non-empty,
      and not be Git LFS pointer files.
    - Without an index: if multi-shard pattern files exist (model-XXXXX-of-YYYYY.*), require index (unhealthy without index).
      Single-file weights (*.safetensors/*.bin/*.gguf) are allowed if non-empty and not LFS pointers.
    - Any '.partial'/'partial' or '.tmp' artifacts anywhere => unhealthy.
    - Recursive LFS pointer scan for suspiciously small files (<200B).
    """

    # Resolve model path: accept direct directory paths or model specs
    candidate = Path(str(model_spec))
    if candidate.exists() and candidate.is_dir():
        model_path = candidate
    else:
        model_path, _, _ = resolve_single_model(model_spec)
    if not model_path:
        return False

    # 1) config.json must be valid, non-empty dict
    config_path = model_path / "config.json"
    if not config_path.exists():
        return False
    try:
        with open(config_path) as f:
            config_data = json.load(f)
        if not isinstance(config_data, dict) or not config_data:
            return False
    except (OSError, json.JSONDecodeError):
        return False

    # 2) Fail fast on partial/tmp markers anywhere in the snapshot
    for p in model_path.rglob("*"):
        name = p.name.lower()
        if ".partial" in name or name.endswith(".partial") or name.endswith(".tmp") or "partial" in name:
            return False

    # Helper: detect Git LFS pointer file
    def _is_lfs_pointer(fp: Path) -> bool:
        try:
            if fp.stat().st_size >= 200:
                return False
            with open(fp, "rb") as f:
                head = f.read(200)
                return b"version https://git-lfs.github.com/spec/v1" in head
        except Exception:
            return False

    # Helper: verify referenced shards
    def _verify_shards(files: list[Path]) -> bool:
        if not files:
            return False
        for f in files:
            try:
                if (not f.exists()) or f.stat().st_size == 0:
                    return False
                if _is_lfs_pointer(f):
                    return False
            except Exception:
                return False
        return True

    # 3) Index-aware checks (safetensors or PyTorch)
    st_index = model_path / "model.safetensors.index.json"
    pt_index = model_path / "pytorch_model.bin.index.json"
    if st_index.exists() or pt_index.exists():
        index_files = [p for p in [st_index, pt_index] if p.exists()]
        for idx in index_files:
            try:
                with open(idx) as f:
                    idx_data = json.load(f)
                weight_map = idx_data.get("weight_map")
                if not isinstance(weight_map, dict) or not weight_map:
                    return False
                referenced = sorted(set(weight_map.values()))
                shard_paths = [model_path / r for r in referenced]
                if not _verify_shards(shard_paths):
                    return False
            except (OSError, json.JSONDecodeError):
                return False
        # Also ensure no recursive LFS pointers elsewhere
        ok, _ = check_lfs_corruption(model_path)
        return ok

    # 4) No index present — detect multi-shard pattern
    #    If pattern shards exist, require index (unhealthy without index by policy parity with 2.0)
    import re
    shard_re = re.compile(r"model-([0-9]{5})-of-([0-9]{5})\.(safetensors|bin)")
    pattern_files = []
    for f in model_path.glob("*"):
        if f.is_file():
            m = shard_re.match(f.name)
            if m:
                pattern_files.append((f, int(m.group(1)), int(m.group(2))))
    if pattern_files:
        # Even if complete by pattern, absence of index => unhealthy
        return False

    # 5) Single-file weights fallback (includes GGUF)
    weight_files = list(model_path.rglob("*.safetensors")) + list(model_path.rglob("*.bin")) + list(model_path.rglob("*.gguf"))
    # Exclude known pattern shards from consideration (handled above)
    filtered_weights = []
    for f in weight_files:
        name = f.name
        if shard_re.match(name):
            continue
        filtered_weights.append(f)
    if not filtered_weights:
        return False
    for wf in filtered_weights:
        if wf.stat().st_size == 0 or _is_lfs_pointer(wf):
            return False

    # Final recursive LFS scan
    ok, _ = check_lfs_corruption(model_path)
    return ok

def check_lfs_corruption(model_path):
    """Recursively scan for Git LFS pointer files (suspiciously small files)."""
    corrupted_files = []
    for file_path in model_path.rglob("*"):
        try:
            if file_path.is_file() and file_path.stat().st_size < 200:
                with open(file_path, 'rb') as f:
                    header = f.read(200)
                    if b'version https://git-lfs.github.com/spec/v1' in header:
                        corrupted_files.append(str(file_path.relative_to(model_path)))
        except Exception:
            # Ignore unreadable files in corruption scan, keep conservative
            continue
    if corrupted_files:
        return False, f"LFS pointers instead of files: {', '.join(corrupted_files)}"
    return True, "No LFS corruption detected"

def check_model_health(model_spec):
    model_path, model_name, commit_hash = resolve_single_model(model_spec)
    if not model_path:
        # resolve_single_model already printed the appropriate error message
        return False
        
    print(f"Checking model: {model_name}")
    if commit_hash:
        print(f"Hash: {commit_hash}")
    
    # Use the robust health check
    if is_model_healthy(model_spec):
        print("\n[OK] Model is healthy and usable!")
        return True
    else:
        # Detailed diagnosis for WHY it's unhealthy
        print("\n[ERROR] Model is corrupted. Detailed diagnosis:")
        
        # Check config.json
        config_path = model_path / "config.json"
        if not config_path.exists():
            print("   - config.json missing")
        else:
            try:
                with open(config_path) as f:
                    config_data = json.load(f)
                if not isinstance(config_data, dict) or len(config_data) == 0:
                    print("   - config.json is empty or invalid")
                else:
                    print("   - config.json found and valid")
            except (OSError, json.JSONDecodeError):
                print("   - config.json exists but contains invalid JSON")
        
        # Check weight files (including gguf support like is_model_healthy)
        weight_files = list(model_path.glob("*.safetensors")) + list(model_path.glob("*.bin")) + list(model_path.glob("*.gguf"))
        if not weight_files:
            weight_files = list(model_path.glob("**/*.safetensors")) + list(model_path.glob("**/*.bin")) + list(model_path.glob("**/*.gguf"))
        
        if weight_files:
            total_size = sum(f.stat().st_size for f in weight_files)
            size_mb = total_size / (1024 * 1024)
            print(f"   - Model weights found ({len(weight_files)} files, {size_mb:.1f}MB)")
        elif (model_path / "model.safetensors.index.json").exists():
            # Check multi-file model
            try:
                with open(model_path / "model.safetensors.index.json") as f:
                    index = json.load(f)
                if 'weight_map' in index:
                    referenced_files = set(index['weight_map'].values())
                    existing_files = [f for f in referenced_files if (model_path / f).exists()]
                    if existing_files:
                        total_size = sum((model_path / f).stat().st_size for f in existing_files)
                        size_mb = total_size / (1024 * 1024)
                        print(f"   - Multi-file weights ({len(existing_files)}/{len(referenced_files)} files, {size_mb:.1f}MB)")
                        if len(existing_files) < len(referenced_files):
                            print("   - Incomplete multi-file model")
                    else:
                        print("   - Multi-file model index found but no weight files exist")
                else:
                    print("   - Multi-file model index is invalid")
            except Exception as e:
                print(f"   - Multi-file model index error: {e}")
        else:
            print("   - No model weights found (.safetensors, .bin, .gguf)")
        
        # Check LFS corruption
        lfs_ok, lfs_msg = check_lfs_corruption(model_path)
        if not lfs_ok:
            print(f"   - {lfs_msg}")
        else:
            print(f"   - {lfs_msg}")
        
        # Show framework
        framework = detect_framework(model_path.parent.parent, model_name)
        print(f"   - Framework: {framework}")
        
        # Offer deletion for corrupted models
        confirm = input("\nModel appears corrupted. Delete? [y/N] ")
        if confirm.lower() == "y":
            import errno
            import shutil
            try:
                if commit_hash:
                    # Delete specific hash/snapshot
                    shutil.rmtree(model_path)
                    print(f"Hash {commit_hash} deleted.")
                else:
                    # Delete entire model directory (go up from snapshots or use base_cache_dir)
                    if model_path.name.startswith("models--"):
                        # model_path is base_cache_dir (corrupted model case)
                        shutil.rmtree(model_path)
                    else:
                        # model_path is snapshot dir
                        model_base_dir = model_path.parent.parent
                        shutil.rmtree(model_base_dir)
                    print(f"Model {model_name} deleted.")
            except PermissionError as e:
                print(f"[ERROR] Permission denied: Cannot delete {e.filename}")
                print("   Try running with appropriate permissions or manually delete the directory.")
            except OSError as e:
                if e.errno == errno.ENOTEMPTY:
                    print(f"[ERROR] Directory not empty: {e.filename}")
                    print("   Another process may be using this model.")
                elif e.errno == errno.EACCES:
                    print(f"[ERROR] Access denied: {e.filename}")
                else:
                    print(f"[ERROR] OS Error while deleting: {e}")
            except Exception as e:
                print(f"[ERROR] Unexpected error while deleting: {type(e).__name__}: {e}")
        
        return False

def check_all_models_health():
    models = [d for d in MODEL_CACHE.iterdir() if d.name.startswith("models--")]
    if not models:
        print("No models found in HuggingFace cache.")
        return
    print(f"Checking {len(models)} models for integrity...\n")
    healthy_models = []
    problematic_models = []
    for model_dir in sorted(models, key=lambda x: x.stat().st_mtime, reverse=True):
        hf_name = cache_dir_to_hf(model_dir.name)
        model_hash = get_model_hash(model_dir)
        print(f"{hf_name} ({model_hash})")
        if is_model_healthy(hf_name):
            healthy_models.append((hf_name, model_hash))
            print("   [OK] Healthy\n")
        else:
            problematic_models.append((hf_name, model_hash))
            print("   [ERROR] Problematic\n")
    print("=" * 50)
    print("Summary:")
    print(f"[OK] Healthy models: {len(healthy_models)}")
    print(f"[ERROR] Problematic models: {len(problematic_models)}")
    if problematic_models:
        print("\n[WARNING] Problematic models:")
        for name, hash_id in problematic_models:
            print(f"   - {name} ({hash_id})")
        print("\nRepair tips:")
        print("   python mlx_knife.cli pull <model-name>  # Re-download")
        print("   python mlx_knife.cli rm <model-name>    # Delete")
        print("   python mlx_knife.cli health <model-name> # Show details")
    return len(problematic_models) == 0

def list_models(show_all=False, framework_filter=None, show_health=False, single_model=None, verbose=False):
    if single_model:
        # Try exact match first
        expanded_model = expand_model_name(single_model)
        model_dir = MODEL_CACHE / hf_to_cache_dir(expanded_model)

        if model_dir.exists():
            models = [model_dir]
        else:
            # If exact match fails, do partial name matching
            if not MODEL_CACHE.exists():
                print(f"No models found matching '{single_model}' - cache directory doesn't exist yet.")
                print("Use 'mlxk pull <model-name>' to download models first.")
                return
            all_models = [d for d in MODEL_CACHE.iterdir() if d.name.startswith("models--")]
            matching_models = []
            
            for model_dir in all_models:
                hf_name = cache_dir_to_hf(model_dir.name)
                # Check if the pattern appears in the model name (case insensitive)
                if single_model.lower() in hf_name.lower():
                    matching_models.append(model_dir)
            
            if not matching_models:
                print(f"No models found matching '{single_model}'!")
                return
            
            models = matching_models
    else:
        if not MODEL_CACHE.exists():
            print("No models found - cache directory doesn't exist yet.")
            print("Use 'mlxk pull <model-name>' to download models first.")
            return
        models = [d for d in MODEL_CACHE.iterdir() if d.name.startswith("models--")]
        if not models:
            print("No models found in HuggingFace cache.")
            return
    if show_health:
        if show_all:
            print(f"{'NAME':<40} {'ID':<10} {'SIZE':<10} {'MODIFIED':<15} {'FRAMEWORK':<10} {'TYPE':<10} {'HEALTH':<8}")
        else:
            print(f"{'NAME':<40} {'ID':<10} {'SIZE':<10} {'MODIFIED':<15} {'HEALTH':<8}")
    else:
        if show_all:
            print(f"{'NAME':<40} {'ID':<10} {'SIZE':<10} {'MODIFIED':<15} {'FRAMEWORK':<10} {'TYPE':<10}")
        else:
            print(f"{'NAME':<40} {'ID':<10} {'SIZE':<10} {'MODIFIED':<15}")
    for m in sorted(models, key=lambda x: x.stat().st_mtime, reverse=True):
        hf_name = cache_dir_to_hf(m.name)
        size = get_model_size(m)
        modified = get_model_modified(m)
        model_hash = get_model_hash(m)
        framework = detect_framework(m, hf_name)
        model_type = detect_model_type(m, hf_name)
        if framework_filter and framework.lower() != framework_filter:
            continue
        # Default (strict) list: show only MLX chat models
        if not show_all and not framework_filter:
            if framework != "MLX":
                continue
            if model_type != "chat":
                continue
        # Handle display name based on verbose flag
        display_name = hf_name
        if hf_name.startswith("mlx-community/") and not verbose:
            # For MLX models, hide prefix unless verbose is set
            display_name = hf_name[len("mlx-community/"):]
        health_status = ""
        if show_health:
            health_status = "[OK]" if is_model_healthy(hf_name) else "[ERR]"
            if show_all:
                print(f"{display_name:<40} {model_hash:<10} {size:<10} {modified:<15} {framework:<10} {model_type:<10} {health_status:<8}")
            else:
                print(f"{display_name:<40} {model_hash:<10} {size:<10} {modified:<15} {health_status:<8}")
        else:
            if show_all:
                print(f"{display_name:<40} {model_hash:<10} {size:<10} {modified:<15} {framework:<10} {model_type:<10}")
            else:
                print(f"{display_name:<40} {model_hash:<10} {size:<10} {modified:<15}")

def run_model(model_spec, prompt=None, interactive=False, temperature=0.7,
              max_tokens=500, top_p=0.9, repetition_penalty=1.1, stream=True,
              use_chat_template=True, hide_reasoning=False, verbose=False):
    """Run an MLX model with enhanced features.
    
    Args:
        model_spec: Model specification (name[@hash])
        prompt: Input prompt (if None and not interactive, enters interactive mode)
        interactive: Force interactive mode
        temperature: Sampling temperature
        max_tokens: Maximum tokens to generate
        top_p: Top-p sampling parameter
        repetition_penalty: Penalty for repeated tokens
        stream: Whether to stream output
    """
    model_path, model_name, commit_hash = resolve_single_model(model_spec)
    if not model_path:
        print(f"Use: mlxk pull {model_spec}")
        sys.exit(1)

    framework = detect_framework(model_path.parent.parent, model_name)
    if framework != "MLX":
        print(f"Model {model_name} is not MLX-compatible (Framework: {framework})!")
        print("Use MLX-Community models: https://huggingface.co/mlx-community")
        sys.exit(1)

    # Try to use the enhanced runner (import module to allow monkeypatching in tests)
    try:
        from . import mlx_runner as _mr

        _mr.run_model_enhanced(
            model_path=str(model_path),
            prompt=prompt,
            interactive=interactive,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            repetition_penalty=repetition_penalty,
            stream=stream,
            use_chat_template=use_chat_template,
            hide_reasoning=hide_reasoning,
            verbose=verbose,
        )
    except ImportError:
        # Fallback to subprocess if mlx_runner is not available
        print("[WARNING] Enhanced runner not available, falling back to subprocess mode")
        print(f"Running model: {model_name}")
        if commit_hash:
            print(f"Hash: {commit_hash}")
        print(f"Cache path: {model_path}")

        if interactive or prompt is None:
            print("Interactive mode not supported in fallback mode")
            prompt = prompt or "Hello"

        print(f"Prompt: {prompt}\n")
        os.system(f'python -m mlx_lm generate --model "{model_path}" --prompt "{prompt}"')

def show_model(model_spec, show_files=False, show_config=False):
    """Show detailed information about a specific model."""
    model_path, model_name, commit_hash = resolve_single_model(model_spec)

    if not model_path:
        return False

    # Basic information
    print(f"Model: {model_name}")
    print(f"Path: {model_path}")

    if commit_hash:
        print(f"Snapshot: {commit_hash}")
    else:
        # Show current snapshot hash
        current_hash = model_path.name
        print(f"Snapshot: {current_hash}")

    # Size
    size = get_model_size(model_path)
    print(f"Size: {size}")

    # Modified time
    modified = get_model_modified(model_path)
    print(f"Modified: {modified}")

    # Framework / Type
    framework = detect_framework(model_path.parent.parent, model_name)
    model_type = detect_model_type(model_path.parent.parent, model_name)
    print(f"Framework: {framework}")
    print(f"Type: {model_type}")
    
    # Quantization info (if available)
    quant_info = get_quantization_info(model_path)
    if quant_info:
        if isinstance(quant_info, dict):
            # Show main quantization config (compact format)
            main_config = []
            if "mode" in quant_info:
                main_config.append(f"mode: {quant_info['mode']}")
            if "bits" in quant_info:
                main_config.append(f"{quant_info['bits']}-bit")
            if "group_size" in quant_info:
                main_config.append(f"group_size: {quant_info['group_size']}")
            
            if main_config:
                print(f"Quantization: {', '.join(main_config)}")
                if "mode" in quant_info:
                    print(f"  Advanced mode '{quant_info['mode']}' (requires MLX ≥0.29.0, MLX-LM ≥0.27.0)")
        else:
            print(f"Quantization: {quant_info}")

    # Quantization and Precision info
    config_path = model_path / "config.json"
    quantization_info = None
    precision_info = None
    gguf_variants = []

    if config_path.exists():
        try:
            with open(config_path) as f:
                config_data = json.load(f)

            # 1. Check for explicit quantization field (MLX style)
            if "quantization" in config_data and isinstance(config_data["quantization"], dict):
                quant = config_data["quantization"]
                if "bits" in quant:
                    quantization_info = f"{quant['bits']}-bit"
                    precision_info = f"int{quant['bits']}"
                if "group_size" in quant:
                    quantization_info += f" (group_size: {quant['group_size']})"

            # 2. Check torch_dtype (HuggingFace standard)
            elif "torch_dtype" in config_data:
                dtype = config_data["torch_dtype"]
                precision_info = dtype
                # Check if model name suggests quantization
                name_lower = model_name.lower()
                if "4bit" in name_lower or "-4b" in name_lower:
                    quantization_info = "4-bit (inferred from name)"
                elif "8bit" in name_lower or "-8b" in name_lower:
                    quantization_info = "8-bit (inferred from name)"
                else:
                    quantization_info = "No quantization detected"

            # 3. Special handling for GGUF files
            gguf_files = sorted(list(model_path.glob("*.gguf")))
            if gguf_files and not quantization_info:
                # Collect all GGUF variants
                gguf_variants = []
                for f in gguf_files:
                    name = f.name
                    size_mb = f.stat().st_size / (1024 * 1024)

                    # Parse quantization type from filename
                    name_lower = name.lower()
                    if "q2_k" in name_lower:
                        variant_info = f"Q2_K (2-bit, {size_mb:.0f} MB)"
                    elif "q3_k_s" in name_lower:
                        variant_info = f"Q3_K_S (3-bit small, {size_mb:.0f} MB)"
                    elif "q3_k_m" in name_lower:
                        variant_info = f"Q3_K_M (3-bit medium, {size_mb:.0f} MB)"
                    elif "q3_k_l" in name_lower:
                        variant_info = f"Q3_K_L (3-bit large, {size_mb:.0f} MB)"
                    elif "q3_k" in name_lower:
                        variant_info = f"Q3_K (3-bit, {size_mb:.0f} MB)"
                    elif "q4_0" in name_lower:
                        variant_info = f"Q4_0 (4-bit, {size_mb:.0f} MB)"
                    elif "q4_k_s" in name_lower:
                        variant_info = f"Q4_K_S (4-bit small, {size_mb:.0f} MB)"
                    elif "q4_k_m" in name_lower:
                        variant_info = f"Q4_K_M (4-bit medium, {size_mb:.0f} MB)"
                    elif "q4_k" in name_lower:
                        variant_info = f"Q4_K (4-bit, {size_mb:.0f} MB)"
                    elif "q5_0" in name_lower:
                        variant_info = f"Q5_0 (5-bit, {size_mb:.0f} MB)"
                    elif "q5_k_s" in name_lower:
                        variant_info = f"Q5_K_S (5-bit small, {size_mb:.0f} MB)"
                    elif "q5_k_m" in name_lower:
                        variant_info = f"Q5_K_M (5-bit medium, {size_mb:.0f} MB)"
                    elif "q5_k" in name_lower:
                        variant_info = f"Q5_K (5-bit, {size_mb:.0f} MB)"
                    elif "q6_k" in name_lower:
                        variant_info = f"Q6_K (6-bit, {size_mb:.0f} MB)"
                    elif "q8_0" in name_lower:
                        variant_info = f"Q8_0 (8-bit, {size_mb:.0f} MB)"
                    else:
                        variant_info = f"{name} ({size_mb:.0f} MB)"

                    gguf_variants.append(variant_info)

                if len(gguf_variants) > 1:
                    quantization_info = "Multiple GGUF variants available"
                    precision_info = "gguf (see variants below)"
                elif len(gguf_variants) == 1:
                    quantization_info = gguf_variants[0].split(' (')[0]
                    precision_info = "gguf"
                else:
                    quantization_info = "GGUF format (quantization unknown)"
                    precision_info = "gguf"

        except (OSError, json.JSONDecodeError, KeyError):
            pass

    # Display quantization and precision info
    if quantization_info:
        print(f"Quantization: {quantization_info}")
    else:
        print("Quantization: Unknown (no info in config)")

    if precision_info:
        print(f"Precision: {precision_info}")
    else:
        print("Precision: Unknown")

    # Display GGUF variants if available
    if gguf_variants and len(gguf_variants) > 1:
        print("\nAvailable GGUF variants:")
        for variant in gguf_variants:
            print(f"   - {variant}")

    # Health status
    health_ok = is_model_healthy(model_name)
    if health_ok:
        print("Health: [OK]")
    else:
        print("Health: [ERROR] CORRUPTED")
        # Check specific issues
        issues = []
        if not (model_path / "config.json").exists():
            issues.append("config.json missing")

        weight_files = list(model_path.glob("*.safetensors")) + list(model_path.glob("*.bin")) + list(model_path.glob("*.gguf"))
        if not weight_files:
            weight_files = list(model_path.glob("**/*.safetensors")) + list(model_path.glob("**/*.bin")) + list(model_path.glob("**/*.gguf"))
        if not weight_files:
            index_file = model_path / "model.safetensors.index.json"
            if not index_file.exists():
                issues.append("No model weights found")

        lfs_ok, lfs_msg = check_lfs_corruption(model_path)
        if not lfs_ok:
            issues.append(lfs_msg)

        if issues:
            print("   Issues:")
            for issue in issues:
                print(f"   - {issue}")

    # Show files if requested
    if show_files:
        print("\nFiles:")
        files = []
        for file in sorted(model_path.rglob("*")):
            if file.is_file():
                relative_path = file.relative_to(model_path)
                file_size = file.stat().st_size
                if file_size >= 1_000_000_000:
                    size_str = f"{file_size / 1_000_000_000:.2f} GB"
                elif file_size >= 1_000_000:
                    size_str = f"{file_size / 1_000_000:.2f} MB"
                elif file_size >= 1_000:
                    size_str = f"{file_size / 1_000:.2f} KB"
                else:
                    size_str = f"{file_size} B"
                files.append((str(relative_path), size_str))

        # Print files in a nice table format
        if files:
            max_name_len = max(len(f[0]) for f in files)
            for file_path, file_size in files:
                print(f"   {file_path:<{max_name_len}}  {file_size:>10}")
        else:
            print("   No files found")

    # Show config if requested
    if show_config:
        config_path = model_path / "config.json"
        if config_path.exists():
            print("\nConfig:")
            try:
                with open(config_path) as f:
                    config_data = json.load(f)
                print(json.dumps(config_data, indent=2))
            except Exception as e:
                print(f"   Error reading config: {e}")
        else:
            print("\nConfig: Not found")

    return True

def rm_model(model_spec, force=False):
    original_spec = model_spec
    
    # First try to resolve using fuzzy matching
    resolved_path, resolved_name, resolved_hash = resolve_single_model(model_spec)
    
    if not resolved_path:
        # resolve_single_model already printed the error message for most cases
        # But ensure we always provide feedback to the user
        print(f"Model '{original_spec}' not found or corrupted.")
        return
        
    # Use the resolved model name for deletion
    model_name = resolved_name
    commit_hash = resolved_hash
    
    
    # Confirm on auto-expansion (if the resolved name is different from input)
    base_spec = original_spec.split("@")[0] if "@" in original_spec else original_spec
    if base_spec != model_name and "/" not in base_spec:
        confirm = input(f"Delete '{model_name}' (matched from '{base_spec}')? [Y/n] ")
        if confirm.lower() == "n":
            print("Delete aborted.")
            return
    
    base_cache_dir = MODEL_CACHE / hf_to_cache_dir(model_name)
    # This should exist since resolve_single_model succeeded, but double-check
    if not base_cache_dir.exists():
        print(f"[ERROR] Model directory disappeared: {model_name}")
        return
    # Specific hash to delete?
    if commit_hash:
        hash_dir = base_cache_dir / "snapshots" / commit_hash
        if not hash_dir.exists():
            print(f"Hash {commit_hash} for model {model_name} not found!")
            print("\nAvailable hashes:")
            snapshots_dir = base_cache_dir / "snapshots"
            if snapshots_dir.exists():
                for snapshot in sorted(snapshots_dir.iterdir()):
                    if snapshot.is_dir():
                        print(f"  {snapshot.name[:8]}")
            return
        if force:
            confirm_delete = True
        else:
            confirm = input(f"Delete hash {commit_hash} of model {model_name}? [y/N] ")
            confirm_delete = confirm.lower() == "y"
        
        if confirm_delete:
            # Issue #23 Fix: Delete entire model directory, not just the snapshot
            # This prevents the double-execution problem where refs/ remain intact
            shutil.rmtree(base_cache_dir)
            print(f"{model_name}@{commit_hash} deleted")
            
            # Clean up associated lock files
            try:
                _cleanup_model_locks(model_name, force)
            except Exception as e:
                print(f"Warning: Could not clean up cache files: {e}")
        else:
            print("Aborted.")
    else:
        # Delete entire model
        if force:
            confirm_delete = True
        else:
            confirm = input(f"Delete entire model {model_name} ({base_cache_dir})? [y/N] ")
            confirm_delete = confirm.lower() == "y"
        
        if confirm_delete:
            shutil.rmtree(base_cache_dir)
            print(f"Model {model_name} completely deleted.")
            
            # Clean up associated lock files
            try:
                _cleanup_model_locks(model_name, force)
            except Exception as e:
                print(f"Warning: Could not clean up cache files: {e}")
        else:
            print("Aborted.")


def _cleanup_model_locks(model_name, force=False):
    """Clean up HuggingFace lock files for a deleted model.
    
    Args:
        model_name: The model name (e.g. 'microsoft/DialoGPT-small')
        force: If True, delete without asking. If False, prompt user.
    """
    locks_dir = MODEL_CACHE / ".locks" / hf_to_cache_dir(model_name)
    
    if not locks_dir.exists():
        return  # No locks to clean up
    
    # Count lock files
    try:
        lock_files = list(locks_dir.iterdir())
        if not lock_files:
            return  # Empty directory
        
        if force:
            # Delete without asking
            shutil.rmtree(locks_dir)
            print(f"Cleaned up cache files ({len(lock_files)} files).")
        else:
            # Ask user
            confirm = input("Clean up cache files? [Y/n] ")
            if confirm.lower() != "n":
                shutil.rmtree(locks_dir)
                print(f"Cache files cleaned up ({len(lock_files)} files).")
            else:
                print("Cache files left intact.")
                
    except Exception as e:
        print(f"Warning: Could not clean up cache files: {e}")

