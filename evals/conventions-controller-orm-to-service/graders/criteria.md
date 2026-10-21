---
type: llm
weight: 1
---

A successful response satisfies all of:

- the ORM call is flagged as a layering violation
- it is moved into a service function
- the controller only parses input and calls the service
