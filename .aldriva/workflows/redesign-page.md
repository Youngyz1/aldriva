# Workflow: Redesigning an Existing View

> Follow `.aldriva/design/legacy-ui.md` principles.

---

## Sequence for Redesigning Legacy Pages

1. **Verify Existing Functionality**: Read the component, identify all props, server actions, state variables, and callbacks.
2. **Execute 9-Question Evaluation Checklist**:
   - What is the user trying to do?
   - What is the primary metric or action?
   - Which cards can be eliminated or combined?
3. **Draft New Layout**:
   - Strip unnecessary card containers.
   - Replace generic gradients with Zinc/Orange primitives.
   - Align table columns, apply `tabular-nums` to stats.
   - Ensure sticky mobile CTAs exist.
4. **Preserve All Logic**: Swap out the presentation markup while keeping all data bindings, handlers, and security checks intact.
5. **Run Existing Tests**: Execute `npm test` to verify zero regression.
6. **Perform Visual QA**: Inspect the new layout in a browser at 375px and 1440px.
