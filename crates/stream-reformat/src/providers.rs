//! Provider adapters: normalize each provider's SSE `data:` payload into
//! [`StreamChunk`]s. Grounded on the real wire formats:
//!
//! - **Google Vertex** `:streamGenerateContent` (`alt=sse`): each `data:` is a
//!   `GenerateContentResponse` with `candidates[0].content.parts[]`; a part
//!   carrying `"thought": true` is reasoning, otherwise it is answer text.
//! - **OpenRouter** `/v1/chat/completions` (`stream:true`): `choices[0].delta`
//!   with `content` (answer) and optional `reasoning` (thinking).
//! - **meta-llm** (OpenAI-compatible): `choices[0].delta.content` (answer).
//!
//! All three terminate with a literal `data: [DONE]` line.

use crate::{ChunkKind, StreamChunk};
use serde_json::Value;

/// The upstream provider whose SSE dialect a line is in.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Provider {
    /// Google Vertex AI (`gemini-3.7-flash`, `:streamGenerateContent`).
    Google,
    /// OpenRouter (`/v1/chat/completions`, `stream:true`).
    OpenRouter,
    /// meta-llm gateway (OpenAI-compatible).
    MetaLlm,
}

/// Strip the SSE framing from a line, returning the JSON body — or signalling a
/// `[DONE]` terminator / a non-data line.
enum Framed<'a> {
    Data(&'a str),
    Done,
    Ignore,
}

fn frame(line: &str) -> Framed<'_> {
    let t = line.trim();
    if t.is_empty() || t.starts_with(':') {
        return Framed::Ignore; // comment / keep-alive / blank
    }
    let body = t.strip_prefix("data:").map(|s| s.trim()).unwrap_or(t);
    if body == "[DONE]" {
        Framed::Done
    } else if body.starts_with('{') || body.starts_with('[') {
        Framed::Data(body)
    } else {
        Framed::Ignore
    }
}

/// Parse one SSE line for `provider` into zero or more chunks.
pub fn parse_sse_line(provider: Provider, line: &str) -> Vec<StreamChunk> {
    match frame(line) {
        Framed::Ignore => Vec::new(),
        Framed::Done => vec![StreamChunk::done()],
        Framed::Data(json) => match serde_json::from_str::<Value>(json) {
            Ok(v) => match provider {
                Provider::Google => parse_google(&v),
                Provider::OpenRouter => parse_openai(&v, true),
                Provider::MetaLlm => parse_openai(&v, false),
            },
            Err(_) => Vec::new(), // tolerate a partial/garbled line
        },
    }
}

/// Vertex: walk `candidates[0].content.parts[]`; `thought:true` ⇒ Thinking.
fn parse_google(v: &Value) -> Vec<StreamChunk> {
    let mut out = Vec::new();
    if let Some(parts) = v
        .pointer("/candidates/0/content/parts")
        .and_then(Value::as_array)
    {
        for part in parts {
            let text = part.get("text").and_then(Value::as_str).unwrap_or("");
            if text.is_empty() {
                continue;
            }
            let is_thought = part.get("thought").and_then(Value::as_bool).unwrap_or(false);
            out.push(StreamChunk {
                text: text.to_string(),
                kind: if is_thought { ChunkKind::Thinking } else { ChunkKind::Answer },
                done: false,
            });
        }
    }
    out
}

/// OpenAI-shaped delta. `with_reasoning` splits out OpenRouter's `reasoning`
/// field as Thinking; meta-llm has only `content`.
fn parse_openai(v: &Value, with_reasoning: bool) -> Vec<StreamChunk> {
    let mut out = Vec::new();
    let delta = v.pointer("/choices/0/delta");
    if let Some(delta) = delta {
        if with_reasoning {
            if let Some(r) = delta.get("reasoning").and_then(Value::as_str) {
                if !r.is_empty() {
                    out.push(StreamChunk::thinking(r));
                }
            }
        }
        if let Some(c) = delta.get("content").and_then(Value::as_str) {
            if !c.is_empty() {
                out.push(StreamChunk::answer(c));
            }
        }
    }
    // OpenAI streams also send a terminal chunk with finish_reason set.
    if v.pointer("/choices/0/finish_reason")
        .map(|f| !f.is_null())
        .unwrap_or(false)
    {
        out.push(StreamChunk::done());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn google_separates_thought_from_answer() {
        let line = r#"data: {"candidates":[{"content":{"parts":[{"text":"let me think","thought":true},{"text":"The answer is 42."}]}}]}"#;
        let chunks = parse_sse_line(Provider::Google, line);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].kind, ChunkKind::Thinking);
        assert_eq!(chunks[1].kind, ChunkKind::Answer);
        assert_eq!(chunks[1].text, "The answer is 42.");
    }

    #[test]
    fn openrouter_splits_reasoning() {
        let line = r#"data: {"choices":[{"delta":{"reasoning":"hmm","content":"Hi"}}]}"#;
        let chunks = parse_sse_line(Provider::OpenRouter, line);
        assert!(chunks.iter().any(|c| c.kind == ChunkKind::Thinking && c.text == "hmm"));
        assert!(chunks.iter().any(|c| c.kind == ChunkKind::Answer && c.text == "Hi"));
    }

    #[test]
    fn metallm_content_only_and_done() {
        assert_eq!(parse_sse_line(Provider::MetaLlm, "data: [DONE]"), vec![StreamChunk::done()]);
        let c = parse_sse_line(Provider::MetaLlm, r#"data: {"choices":[{"delta":{"content":"x"}}]}"#);
        assert_eq!(c, vec![StreamChunk::answer("x")]);
        // meta-llm has no reasoning channel even if present
        let c2 = parse_sse_line(Provider::MetaLlm, r#"data: {"choices":[{"delta":{"reasoning":"r","content":"y"}}]}"#);
        assert_eq!(c2, vec![StreamChunk::answer("y")]);
    }

    #[test]
    fn keepalive_and_garbage_are_ignored() {
        assert!(parse_sse_line(Provider::Google, ": keep-alive").is_empty());
        assert!(parse_sse_line(Provider::Google, "").is_empty());
        assert!(parse_sse_line(Provider::OpenRouter, "data: not-json").is_empty());
    }
}
