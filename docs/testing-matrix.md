# Testing Matrix

Which test dimensions each critical flow needs. ● = required · ○ = recommended · — = N/A.
Architectural guarantees (bottom section) are the tests unit coverage tends to miss.

| Flow | Unit | Integration | Encryption | Sync/Conflict | Multi-device | Recovery |
|------|:----:|:-----------:|:----------:|:-------------:|:------------:|:--------:|
| Expense create | ● | ● | ● | ○ | ○ | — |
| Expense edit (settled splits) | ● | ● | ● | ● | ○ | ● |
| Expense delete/restore | ● | ● | — | ○ | — | ● |
| Split calculation (all types) | ● | ○ | — | — | — | — |
| Recurring expense generation | ● | ● | ● | — | — | ○ |
| Month close / carry-forward | ● | ● | — | ○ | — | ● |
| Settlement propose/update | ● | ● | — | ● | ○ | — |
| Group create / invite / join | ● | ● | ● | — | ● | — |
| Role change / ownership transfer | ● | ● | — | — | — | — |
| Group key rotation | ● | ● | ● | — | ● | ● |
| Login / refresh / logout | ● | ● | — | — | ● | ○ |
| 2FA enable/verify | ● | ● | ● | — | — | — |
| Password change (UDK re-wrap) | ● | ● | ● | — | ● | ● |
| Dashboard aggregation | ● | ● | ● | — | — | — |
| Attachment encrypt/upload | ● | ● | ● | — | ● | ○ |
| Import batch (transactional) | ● | ● | ○ | — | — | ● |
| AI opt-in gate | ● | ● | — | — | ● | — |

## Architectural guarantee tests (Phase 6 — enforce invariants, not just units)

These verify the architecture stays intact as code evolves. Each maps to a frozen decision.

1. **Group member A creates encrypted expense → member B decrypts it.** (Key provisioning end-to-end.)
2. **Removed member cannot decrypt expenses created after key rotation.** (ENC-002 / GRP-005 — currently a gap.)
3. **Projection/aggregation can be discarded and recomputed with no data loss.** (Derived-data rule.)
4. **Search/index rebuild produces identical results.** (Roadmap — add when blind index lands.)
5. **Offline edits sync correctly after reconnect.** (Roadmap — add with the offline queue.)
6. **ExpenseShare/split sums always equal the encrypted expense amount.** (Split invariant.)
7. **Editing a settled expense creates an adjustment, not a silent history change.** (EXP-001.)
8. **One ACTIVE key version per group** is DB-enforced (partial unique index). ✅ verifiable now.
9. **Backend never receives ZK plaintext** — DTO `@IsCiphertext` rejects plaintext titles/notes/goal titles.
10. **Base-currency change is blocked once activity exists;** settlements match group base.
11. **Owner cannot leave without transfer;** non-owner cannot promote to owner (GRP-001).
12. **AI egress requires a persisted, server-checked opt-in** (AI-001).

## Notes

- Backend specs live beside services as `*.spec.ts`; run with `npx nx test backend`.
- Frontend: `npx nx test frontend`. E2E: see `docs/E2E_PLAYWRIGHT_SUMMARY.md`.
- When closing a gap-tracker item, add the matching guarantee test above if one is listed.
