#!/usr/bin/env python3
import os
import sys
from pathlib import Path

from diffusers import DiffusionPipeline
import torch


def detect_device():
    if torch.cuda.is_available():
        return "cuda", torch.bfloat16
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps", torch.float16
    return "cpu", torch.float32


def main():
    prompt = sys.argv[1] if len(sys.argv) > 1 else "一只会飞的小狐狸，儿童绘本插画，温柔水彩风，超清，4K，电影级构图"
    negative_prompt = os.getenv("NEGATIVE_PROMPT", "")
    model_name = os.getenv("MODEL_NAME", "Qwen/Qwen-Image")
    width = int(os.getenv("WIDTH", "1328"))
    height = int(os.getenv("HEIGHT", "1328"))
    steps = int(os.getenv("STEPS", "30"))
    cfg = float(os.getenv("TRUE_CFG_SCALE", "4.0"))
    seed = int(os.getenv("SEED", "42"))
    out_path = Path(os.getenv("OUT", "output/qwen-image-local.png"))
    out_path.parent.mkdir(parents=True, exist_ok=True)

    device, dtype = detect_device()
    print(f"[qwen-image] loading {model_name} on {device} with dtype={dtype}")

    pipe = DiffusionPipeline.from_pretrained(model_name, torch_dtype=dtype)
    pipe = pipe.to(device)

    generator = torch.Generator(device=device if device != "mps" else "cpu").manual_seed(seed)
    image = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt,
        width=width,
        height=height,
        num_inference_steps=steps,
        true_cfg_scale=cfg,
        generator=generator,
    ).images[0]
    image.save(out_path)
    print(f"[qwen-image] saved -> {out_path}")


if __name__ == "__main__":
    main()
