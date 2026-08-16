//! # stream-reformat
//!
//! Inflight reformatting of a live LLM token stream — *pattern-match, score, and
//! intervene while the tokens are still arriving* (the `ruvnet/midstream`
//! philosophy), applied across three providers: **Google Vertex**
//! (`gemini-3.7-flash`), **OpenRouter**, and **meta-llm**.
//!
//! Provider streams reach us as Server-Sent-Events (`data: {json}` lines). Each
//! provider's payload shape differs, so [`providers`] normalizes every line into
//! a common [`StreamChunk`]; the [`reformat`] pipeline then applies inflight
//! interventions and emits [`ReformatEvent`]s on separate channels.
//!
//! Interventions (see [`reformat::ReformatPipeline`]):
//! 1. **Separate thinking from answer** — reasoning models (like
//!    `gemini-3.7-flash`) interleave a hidden thought stream with the answer.
//! 2. **Collapse near-duplicate repetition** — a common stutter/loop artifact —
//!    using the real `midstreamer-temporal-compare` similarity search.
//! 3. **Normalize whitespace**.
//!
//! ```
//! use stream_reformat::{Reformatter, Provider, Channel};
//! let mut rf = Reformatter::new();
//! let mut events = rf.push_sse(Provider::MetaLlm, "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}");
//! events.extend(rf.finish()); // flush the buffered (newline-less) line
//! assert!(events.iter().any(|e| e.channel == Channel::Answer && e.text.contains("Hello")));
//! ```

pub mod providers;
pub mod reformat;

#[cfg(feature = "wasm")]
pub mod wasm;

pub use providers::Provider;
pub use reformat::ReformatPipeline;

use serde::Serialize;

/// What a chunk of the stream carries.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChunkKind {
    /// User-visible answer text.
    Answer,
    /// Hidden reasoning / "thinking" text.
    Thinking,
    /// Non-text metadata (kept for completeness; not emitted).
    Meta,
}

/// A provider-neutral piece of the stream, produced by [`providers`].
#[derive(Clone, Debug, PartialEq)]
pub struct StreamChunk {
    pub text: String,
    pub kind: ChunkKind,
    /// True when this line signals end-of-stream (`data: [DONE]`).
    pub done: bool,
}

impl StreamChunk {
    pub fn answer(text: impl Into<String>) -> Self {
        StreamChunk { text: text.into(), kind: ChunkKind::Answer, done: false }
    }
    pub fn thinking(text: impl Into<String>) -> Self {
        StreamChunk { text: text.into(), kind: ChunkKind::Thinking, done: false }
    }
    pub fn done() -> Self {
        StreamChunk { text: String::new(), kind: ChunkKind::Meta, done: true }
    }
}

/// Which reformatted channel an event belongs to — the headline separation.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Channel {
    Answer,
    Thinking,
}

/// A reformatted, emit-ready piece of output.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ReformatEvent {
    pub channel: Channel,
    pub text: String,
}

/// The top-level orchestrator: feed it raw SSE lines tagged with their provider,
/// get back reformatted events. Holds one [`ReformatPipeline`] across the stream.
pub struct Reformatter {
    pipeline: ReformatPipeline,
}

impl Default for Reformatter {
    fn default() -> Self {
        Self::new()
    }
}

impl Reformatter {
    pub fn new() -> Self {
        Reformatter { pipeline: ReformatPipeline::new() }
    }

    /// Parse one SSE line for `provider` and run it through the reformat pipeline.
    pub fn push_sse(&mut self, provider: Provider, line: &str) -> Vec<ReformatEvent> {
        let mut out = Vec::new();
        for chunk in providers::parse_sse_line(provider, line) {
            out.extend(self.pipeline.push(chunk));
        }
        out
    }

    /// Flush any buffered answer text (call once the stream ends if the provider
    /// didn't send an explicit `[DONE]`).
    pub fn finish(&mut self) -> Vec<ReformatEvent> {
        self.pipeline.finish()
    }
}
