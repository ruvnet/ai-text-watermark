//! The inflight reformat pipeline — the interventions applied *while* the stream
//! arrives. Provider-neutral: it consumes [`StreamChunk`]s and emits
//! [`ReformatEvent`]s.
//!
//! - **Thinking is separated** onto its own channel (the headline transform).
//! - **Answer** text is line-buffered; each completed line is whitespace-
//!   normalized and checked for **near-duplicate repetition** against recent
//!   lines using the real `midstreamer_temporal_compare::TemporalComparator`
//!   similarity search — a repeat is collapsed (dropped).

use crate::{Channel, ChunkKind, ReformatEvent, StreamChunk};
use midstreamer_temporal_compare::{ComparisonAlgorithm, Sequence, TemporalComparator};

/// Build a `Sequence<char>` (timestamped by position) for temporal-compare.
fn seq_of(chars: &[char]) -> Sequence<char> {
    let mut s = Sequence::new();
    for (i, &c) in chars.iter().enumerate() {
        s.push(c, i as u64);
    }
    s
}

/// Streaming reformat state for one LLM response.
pub struct ReformatPipeline {
    answer_buf: String,
    recent: Vec<Vec<char>>,
    comparator: TemporalComparator<char>,
    sim_threshold: f64,
    recent_cap: usize,
}

impl Default for ReformatPipeline {
    fn default() -> Self {
        Self::new()
    }
}

impl ReformatPipeline {
    pub fn new() -> Self {
        ReformatPipeline {
            answer_buf: String::new(),
            recent: Vec::new(),
            comparator: TemporalComparator::new(64, 8192),
            // Normalized edit-distance similarity (1 - dist/maxlen). 0.9 collapses
            // near-exact repeats ("mat." vs "mat!") but not distinct short lines
            // ("The sky is blue." vs "Grass is green.", measured sim ~0.3).
            sim_threshold: 0.9,
            recent_cap: 8,
        }
    }

    /// Set the repetition-collapse similarity threshold (0..1; higher = stricter).
    pub fn with_threshold(mut self, t: f64) -> Self {
        self.sim_threshold = t.clamp(0.0, 1.0);
        self
    }

    /// Feed one normalized chunk; get zero or more reformatted events.
    pub fn push(&mut self, chunk: StreamChunk) -> Vec<ReformatEvent> {
        if chunk.done {
            return self.flush_answer(true);
        }
        match chunk.kind {
            ChunkKind::Thinking => {
                if chunk.text.is_empty() {
                    Vec::new()
                } else {
                    vec![ReformatEvent { channel: Channel::Thinking, text: chunk.text }]
                }
            }
            ChunkKind::Answer => {
                self.answer_buf.push_str(&chunk.text);
                self.flush_answer(false)
            }
            ChunkKind::Meta => Vec::new(),
        }
    }

    /// Flush any buffered answer at end-of-stream.
    pub fn finish(&mut self) -> Vec<ReformatEvent> {
        self.flush_answer(true)
    }

    fn flush_answer(&mut self, force: bool) -> Vec<ReformatEvent> {
        let mut out = Vec::new();
        loop {
            match self.answer_buf.find('\n') {
                Some(i) => {
                    let seg: String = self.answer_buf.drain(..=i).collect();
                    if let Some(ev) = self.process_segment(&seg) {
                        out.push(ev);
                    }
                }
                None => {
                    if force && !self.answer_buf.is_empty() {
                        let seg = std::mem::take(&mut self.answer_buf);
                        if let Some(ev) = self.process_segment(&seg) {
                            out.push(ev);
                        }
                    }
                    break;
                }
            }
        }
        out
    }

    fn process_segment(&mut self, raw: &str) -> Option<ReformatEvent> {
        let norm = normalize_ws(raw);
        if norm.is_empty() {
            return None;
        }
        let needle: Vec<char> = norm.chars().collect();
        let needle_seq = seq_of(&needle);
        // Repetition: near-duplicate of a recent line? Collapse it. Uses the real
        // temporal-compare EditDistance, normalized to a similarity we threshold.
        for prev in &self.recent {
            let maxlen = prev.len().max(needle.len()).max(1) as f64;
            let dist = self
                .comparator
                .compare(&seq_of(prev), &needle_seq, ComparisonAlgorithm::EditDistance)
                .map(|r| r.distance)
                .unwrap_or(maxlen);
            if 1.0 - dist / maxlen >= self.sim_threshold {
                return None;
            }
        }
        self.recent.push(needle);
        if self.recent.len() > self.recent_cap {
            self.recent.remove(0);
        }
        Some(ReformatEvent { channel: Channel::Answer, text: norm })
    }
}

/// Collapse internal whitespace runs to a single space and trim; drop CR/LF
/// (line boundaries are handled by the buffer, not the text).
fn normalize_ws(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_space = false;
    for ch in s.chars() {
        if ch == '\n' || ch == '\r' {
            continue;
        }
        if ch.is_whitespace() {
            if !prev_space {
                out.push(' ');
                prev_space = true;
            }
        } else {
            out.push(ch);
            prev_space = false;
        }
    }
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thinking_is_separated_from_answer() {
        let mut p = ReformatPipeline::new();
        let mut evs = p.push(StreamChunk::thinking("reasoning..."));
        evs.extend(p.push(StreamChunk::answer("Hello world\n")));
        assert_eq!(evs[0].channel, Channel::Thinking);
        assert!(evs.iter().any(|e| e.channel == Channel::Answer && e.text == "Hello world"));
    }

    #[test]
    fn normalizes_whitespace() {
        let mut p = ReformatPipeline::new();
        let evs = p.push(StreamChunk::answer("too    many\t\tspaces  \n"));
        assert_eq!(evs[0].text, "too many spaces");
    }

    #[test]
    fn collapses_repeated_lines() {
        let mut p = ReformatPipeline::new();
        let mut all = Vec::new();
        all.extend(p.push(StreamChunk::answer("The cat sat on the mat.\n")));
        all.extend(p.push(StreamChunk::answer("The cat sat on the mat.\n"))); // exact repeat
        all.extend(p.push(StreamChunk::answer("The cat sat on the mat!\n"))); // near-repeat
        all.extend(p.push(StreamChunk::answer("A different sentence entirely.\n")));
        let answers: Vec<_> = all.iter().filter(|e| e.channel == Channel::Answer).collect();
        assert_eq!(answers.len(), 2, "repeats not collapsed: {answers:?}");
        assert_eq!(answers[0].text, "The cat sat on the mat.");
        assert_eq!(answers[1].text, "A different sentence entirely.");
    }

    #[test]
    fn buffers_partial_lines_until_newline_or_finish() {
        let mut p = ReformatPipeline::new();
        assert!(p.push(StreamChunk::answer("partial ")).is_empty());
        assert!(p.push(StreamChunk::answer("still going")).is_empty());
        let evs = p.finish();
        assert_eq!(evs[0].text, "partial still going");
    }
}
