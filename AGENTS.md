# Agent Instructions

Follow these rules unless the user explicitly instructs otherwise.

## Sources of Truth

- `PRD.md` owns product intent, scope, requirements, and definition of done.
- `.planning/` owns current plans, milestones, phases, execution state, and research.
- `SETUP.md` owns installation, configuration, environment, and run instructions.
- `UI_DESIGN.md`, when present, owns persistent visual and design-system rules.
- `DECISIONS.md`, when present, contains only important architectural constraints that should not be casually reversed.
- The codebase represents what is actually implemented.
- Git represents implementation history.

Do not create parallel documentation for information already owned by one of these sources.

## Working Rules

1. Work on one clear objective at a time.
2. Inspect the relevant existing code before modifying it.
3. Prefer existing project patterns over inventing new architecture.
4. Make the smallest change that correctly solves the problem.
5. Do not modify unrelated functionality.
6. Do not silently change product scope or major architecture.
7. Verify behaviour through execution, not code inspection alone.
8. Fix root causes rather than masking symptoms.
9. Preserve working behaviour unless the task explicitly changes it.
10. Never expose, log, or commit secrets.

## Planning

Use GSD for project planning and execution state.

Do not manually maintain `TASKS.md`, `STATE.md`, `CHANGELOG.md`, or `BUGS.md` unless explicitly requested.

Use the appropriate GSD workflow rather than recreating its planning or tracking manually.

## Documentation

Documentation is updated only when its owned truth changes.

- Update `PRD.md` only when product scope or requirements change.
- Update `SETUP.md` only when setup or run instructions change.
- Update `UI_DESIGN.md` only when persistent design rules change.
- Update `DECISIONS.md` only under its own strict inclusion rules.

Implementation progress alone is not a reason to rewrite permanent documentation.

## Ambiguity and Conflicts

If instructions, documentation, and implementation materially disagree:

1. Investigate the relevant code and current planning context.
2. Do not guess which version is correct.
3. Surface the conflict before making a consequential change.

Prefer reversible changes when uncertainty remains.

## Completion

Code being written does not mean the task is complete.

Before considering work complete:

- Run the relevant checks.
- Test the intended user behaviour.
- Check important failure states.
- Confirm no obvious regression was introduced.

Then continue according to the current GSD plan.