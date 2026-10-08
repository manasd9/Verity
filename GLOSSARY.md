# Verity

Verity tests FlexAgent agents from the outside: it builds golden datasets from a client's sources, asks the agent each question, and has a judge model score the answers.

## Language

**Source**:
A client document or website snapshot that Verity generates questions from.
_Avoid_: Document (when a website is meant), knowledge base

**Passage**:
A contiguous piece of a source's text.
_Avoid_: Chunk, excerpt, snippet

**Evidence**:
The passages of a source that back a question's expected answer; one to three per question.
_Avoid_: Source evidence, nearby passage, context
