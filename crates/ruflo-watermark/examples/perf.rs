//! Manual perf harness: ns/token across the hot paths. `cargo run --release --example perf`.
use std::time::Instant;
use ruflo_watermark::{detect_gumbel, MidStream, ProxyConfig, Scheme, StreamProxy,
                      WatermarkConfig, WatermarkKey, Watermarker};

fn timeit<F: FnMut()>(label: &str, iters: u64, mut f: F) {
    // warmup
    for _ in 0..(iters/10).max(1) { f(); }
    let t = Instant::now();
    for _ in 0..iters { f(); }
    let ns = t.elapsed().as_nanos() as f64 / iters as f64;
    println!("{:<38} {:>9.1} ns/tok   {:>12.0} tok/s", label, ns, 1e9/ns);
}

fn main() {
    for &v in &[256usize, 1024, 32000] {
        println!("\n=== vocab {v} ===");
        let toks: Vec<u32> = (0..v as u32).collect();
        let probs = vec![1.0f32 / v as f32; v];
        let logits = vec![0.0f32; v];
        let cfgg = WatermarkConfig::new(WatermarkKey(1)).with_layers(1);
        let cfgt = WatermarkConfig::new(WatermarkKey(1)).with_layers(6);
        let n = if v >= 32000 { 20_000 } else { 200_000 };

        let mut wm = Watermarker::new(cfgg, Scheme::Gumbel);
        timeit("gen gumbel step", n, || { wm.step(&toks, &probs); });
        let mut wt = Watermarker::new(cfgt, Scheme::Tournament);
        timeit("gen tournament(d6) step", n, || { wt.step(&toks, &probs); });

        let mut p = StreamProxy::new(cfgg, Scheme::Gumbel, ProxyConfig::default());
        timeit("proxy push_logits (full)", n, || { p.push_logits(&logits); });
        let mut pk = StreamProxy::new(cfgg, Scheme::Gumbel, ProxyConfig{temperature:0.9, top_k:40, top_p:0.95});
        timeit("proxy push_logits (topk40+p95)", n, || { pk.push_logits(&logits); });

        let mut ms = MidStream::new(cfgg, Scheme::Gumbel, ProxyConfig{temperature:0.9, top_k:40, top_p:0.95}, 1<<30);
        timeit("midstream push_logits (topk40)", n, || { ms.push_logits(&logits); });

        // detection scan: ns per scored token
        let mut wgen = Watermarker::new(cfgg, Scheme::Gumbel);
        let stream: Vec<u32> = (0..2000).map(|_| toks[wgen.step(&toks,&probs)]).collect();
        let t = Instant::now(); let reps=2000u64;
        for _ in 0..reps { std::hint::black_box(detect_gumbel(&stream, cfgg)); }
        let ns_per = t.elapsed().as_nanos() as f64 / (reps as f64 * stream.len() as f64);
        println!("{:<38} {:>9.2} ns/tok   {:>12.0} tok/s", "detect gumbel scan", ns_per, 1e9/ns_per);
    }
}
