//! End-to-end: canned provider SSE streams → reformatted events. Offline, no keys.

use stream_reformat::{Channel, Provider, Reformatter};

#[test]
fn google_stream_separates_thinking_and_collapses_repeats() {
    let mut rf = Reformatter::new();
    let lines = [
        r#"data: {"candidates":[{"content":{"parts":[{"text":"thinking about it","thought":true}]}}]}"#,
        r#"data: {"candidates":[{"content":{"parts":[{"text":"The sky is blue.\n"}]}}]}"#,
        r#"data: {"candidates":[{"content":{"parts":[{"text":"The sky is blue.\n"}]}}]}"#, // repeat
        r#"data: {"candidates":[{"content":{"parts":[{"text":"Grass is green.\n"}]}}]}"#,
        "data: [DONE]",
    ];
    let mut evs = Vec::new();
    for l in lines {
        evs.extend(rf.push_sse(Provider::Google, l));
    }
    let thinking: Vec<_> = evs.iter().filter(|e| e.channel == Channel::Thinking).collect();
    let answers: Vec<_> = evs.iter().filter(|e| e.channel == Channel::Answer).collect();
    assert_eq!(thinking.len(), 1);
    assert_eq!(thinking[0].text, "thinking about it");
    assert_eq!(answers.len(), 2, "repeat not collapsed: {answers:?}");
    assert_eq!(answers[0].text, "The sky is blue.");
    assert_eq!(answers[1].text, "Grass is green.");
}

#[test]
fn openrouter_stream_routes_reasoning() {
    let mut rf = Reformatter::new();
    let lines = [
        r#"data: {"choices":[{"delta":{"reasoning":"let me consider"}}]}"#,
        r#"data: {"choices":[{"delta":{"content":"Answer: 42\n"}}]}"#,
        r#"data: {"choices":[{"delta":{},"finish_reason":"stop"}]}"#,
    ];
    let mut evs = Vec::new();
    for l in lines {
        evs.extend(rf.push_sse(Provider::OpenRouter, l));
    }
    assert!(evs.iter().any(|e| e.channel == Channel::Thinking && e.text == "let me consider"));
    assert!(evs.iter().any(|e| e.channel == Channel::Answer && e.text == "Answer: 42"));
}

#[test]
fn metallm_openai_stream_answers_only() {
    let mut rf = Reformatter::new();
    let lines = [
        r#"data: {"choices":[{"delta":{"content":"Hello "}}]}"#,
        r#"data: {"choices":[{"delta":{"content":"there\n"}}]}"#,
        "data: [DONE]",
    ];
    let mut evs = Vec::new();
    for l in lines {
        evs.extend(rf.push_sse(Provider::MetaLlm, l));
    }
    assert!(evs.iter().all(|e| e.channel == Channel::Answer));
    assert_eq!(evs[0].text, "Hello there");
}
