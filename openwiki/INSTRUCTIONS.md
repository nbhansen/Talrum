A high-level code wiki for this repository. The audience is an engineer getting oriented; the goal is a correct mental model, not a substitute for reading the code.

Write about concepts, responsibilities, data flow, and rationale — the "why" behind the architecture. Point to files and directories as entry points for detail rather than reproducing their contents.

Hard rules:

- No code snippets, shell commands, SQL, or step-by-step operational procedures. For operations, link to the runbooks in `docs/runbooks/` instead of restating them.
- No exact identifiers pulled from code (storage keys, lock names, config values, function signatures, retry counts, port numbers). Describe the behavior in prose and name the file where the detail lives.
- Never state a specific fact you have not read directly from the source in this run. If unsure, describe the behavior generally and point to the file.
- No exhaustive inventories (every feature folder, every test file, every function). Name the two or three most illustrative examples and say where the rest live.

Prefer fewer, shorter pages. A page that says less but is entirely true beats a detailed page with invented specifics.
