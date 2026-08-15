# ruflo-watermark

High-speed **SynthID-Text-style LLM text watermarking** (generation + detection)
in Rust, with optional WebAssembly bindings.

A watermark rides the tie-break randomness among *already-plausible* tokens: it
never injects an out-of-distribution word, costs no extra tokens, and is
detectable only with the key.

- **Schemes:** `Gumbel` (per-instance distortion-free), `Tournament` (SynthID),
  `TournamentNd` (key-averaged non-distortionary).
- **Detectors:** standard, indel-robust self-sync, exact-Gamma short-text,
  Higher-Criticism.
- **Extras:** a robustness-evaluation harness, a Darwin/flywheel detector-param
  tuner, and an authorized un-marked-generation governance path.
- **Deliberately no watermark-removal / laundering tooling.**

```rust
use ruflo_watermark::{Watermarker, WatermarkConfig, WatermarkKey, Scheme, detect_gumbel};

let cfg = WatermarkConfig::new(WatermarkKey::from_bytes(b"my-secret"));
let mut wm = Watermarker::new(cfg, Scheme::Gumbel);
let idx = wm.step(&candidate_ids, &probs); // emit one token
let r = detect_gumbel(&tokens, cfg);
assert!(r.is_watermarked(1e-6));
```

Full docs, a live playground, and the JS/WASM package (`@claude-flow/watermark`):
**https://github.com/ruvnet/ai-text-watermark**

Method: SynthID-Text (Dathathri et al., *Nature* 2024) and the Aaronson (2022) /
Kuditipudi et al. (2024) distortion-free family. License: MIT.
