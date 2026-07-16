# Prompt Library

Four standard prompts for working with Claude Code on FinMate. Copy, fill the `<...>` slots, paste.
The point is to reference the frozen docs instead of re-explaining the architecture each time.

---

## 1. Audit

```
Audit the <MODULE> module using docs/architecture/architecture-inventory.md.

Sources of truth: docs/frozen-decisions.md, docs/coding-rules.md, the module's
contract in docs/contracts/<module>-contract.md, and ARCHITECTURE.md.

For every documented guarantee, verify it against the real code with file:line
evidence. Mark each ✅ Compliant / ⚠ Partial / ❌ Missing / 📋 Roadmap-only.
Only mark ✅ when you saw enforcing code. List undocumented behavior separately.

Output a report saved to docs/audits/<module>-audit.md, then add/refresh the
corresponding rows in docs/architecture/gap-tracker.md.
```

## 2. Implement

```
Implement <GAP-ID> from docs/architecture/gap-tracker.md.

Before coding: read that gap row, the linked audit finding, the module contract
in docs/contracts/, and the files listed in docs/architecture/adr-map.md for the
relevant decision. Obey docs/coding-rules.md and docs/frozen-decisions.md.

Make the smallest change that closes the gap. Do not touch other gap items.
Add/adjust tests per docs/testing-matrix.md. When done, flip the gap-tracker row
to Done and check the box in docs/module-checklist.md.
```

## 3. Review

```
Review the current diff against the architecture.

Answer explicitly:
- Does it comply with docs/frozen-decisions.md and docs/coding-rules.md?
- Did it introduce a second source of truth or duplicate data?
- Does it break offline-first (the optimistic-lock reconciliation flow)?
- Does it increase metadata leakage or weaken the ZK boundary?
- Does it change sync/crypto/API semantics without an ADR?
- Does it stay within the module's contract (docs/contracts/)?

Cite file:line for any concern. Do not rubber-stamp; if uncertain, say so.
```

## 4. Test

```
Add tests for <GAP-ID or feature> using docs/testing-matrix.md.

Cover the dimensions marked required for this feature (unit, integration,
encryption, sync/conflict, multi-device, recovery as applicable). Follow the
existing *.spec.ts style and the split/settlement invariants in coding-rules.md
(split sums = amount; settled edits create adjustments; projection rebuildable).
Run the suite and report pass/fail with output.
```

---

### Workflow (review-first)

1. **Audit** → Claude proposes findings; you check them against the ADRs.
2. **Implement** one `GAP-ID` at a time.
3. **Review** the diff with prompt 3.
4. **Test** with prompt 4; you run tests and make the final call.
5. After each closed ADR/gap, re-run **Review** to catch regressions.
