//! WASM bindings (`--features wasm --target wasm32-unknown-unknown`). A thin
//! JS-facing surface over [`crate::Reformatter`]: feed SSE lines tagged with a
//! provider string, get back a JSON array of `{channel, text}` events.

use wasm_bindgen::prelude::*;

use crate::{Provider, Reformatter};

/// JS-facing inflight stream reformatter.
#[wasm_bindgen]
pub struct WasmReformatter {
    inner: Reformatter,
}

fn provider_of(name: &str) -> Provider {
    match name {
        "google" | "vertex" | "gemini" => Provider::Google,
        "openrouter" => Provider::OpenRouter,
        _ => Provider::MetaLlm, // "metallm" and default
    }
}

#[wasm_bindgen]
impl WasmReformatter {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmReformatter {
        WasmReformatter { inner: Reformatter::new() }
    }

    /// Parse + reformat one SSE line. `provider`: `"google"` | `"openrouter"` |
    /// `"metallm"`. Returns a JSON array of `{ "channel": "answer"|"thinking",
    /// "text": "..." }`.
    pub fn push_sse(&mut self, provider: &str, line: &str) -> String {
        let events = self.inner.push_sse(provider_of(provider), line);
        serde_json::to_string(&events).unwrap_or_else(|_| "[]".to_string())
    }

    /// Flush any buffered answer text at end-of-stream. Same JSON shape.
    pub fn finish(&mut self) -> String {
        serde_json::to_string(&self.inner.finish()).unwrap_or_else(|_| "[]".to_string())
    }
}

impl Default for WasmReformatter {
    fn default() -> Self {
        Self::new()
    }
}
