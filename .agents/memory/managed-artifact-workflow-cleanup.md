---
name: Managed artifact workflow cleanup
description: How to permanently disable an obsolete artifact service workflow without affecting the active artifact.
---

Managed artifact workflows cannot be removed with the ordinary workflow-removal operation. Permanently disabling an obsolete service requires removing its service declaration through the validated artifact manifest replacement flow, then terminating any process left behind by the old workflow.

**Why:** The workflow manager rejects direct removal of artifact-owned workflows, and stopping them alone does not prevent automatic restarts.

**How to apply:** Preserve the active artifact and its app/lib code; remove only the obsolete artifact service declarations, verify the workflow inventory contains only the intended service, and check the process table for stale children.