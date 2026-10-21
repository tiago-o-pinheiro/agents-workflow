---
type: llm
weight: 1
---

A successful response satisfies all of:

- the wrapper hook is flagged as a re-export of other hooks
- it is deleted
- components call the underlying hooks directly
