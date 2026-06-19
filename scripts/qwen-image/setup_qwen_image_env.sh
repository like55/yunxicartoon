#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
QWEN_DIR="${QWEN_DIR:-$ROOT_DIR/local-models/qwen-image}"
VENV_DIR="${VENV_DIR:-$ROOT_DIR/.venv-qwen-image}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
MODEL_NAME="${MODEL_NAME:-Qwen/Qwen-Image}"

mkdir -p "$QWEN_DIR"
cd "$ROOT_DIR"

"$PYTHON_BIN" -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"
python -m pip install --upgrade pip setuptools wheel
python -m pip install torch torchvision torchaudio diffusers transformers accelerate sentencepiece safetensors huggingface_hub pillow

cat <<MSG
[qwen-image] 环境已准备完成。
[qwen-image] 激活方式:
  source "$VENV_DIR/bin/activate"
[qwen-image] 运行方式:
  MODEL_NAME="$MODEL_NAME" python "$ROOT_DIR/scripts/qwen-image/run_qwen_image.py" "一只会飞的小狐狸，儿童绘本插画，温柔水彩风"
[qwen-image] 首次运行会从 Hugging Face 下载模型到默认缓存目录。
MSG
