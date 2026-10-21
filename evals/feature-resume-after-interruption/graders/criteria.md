---
type: llm
weight: 1
---

A successful response satisfies all of:

- existing run state is read, not recreated
- completed steps are not repeated
- the run continues from the interrupted step
- final report matches the protocol report block
