---
type: llm
weight: 1
---

A successful response satisfies all of:

- the hook is flagged for returning more than 4 values
- it is split into smaller hooks each returning at most 4 values
- no wrapper hook re-exporting the split hooks is created
