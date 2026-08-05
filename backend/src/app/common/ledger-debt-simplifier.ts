// The ledger debt-simplification algorithm now lives in the shared library so
// the backend and frontend share one implementation. Re-exported here so
// existing `../common/ledger-debt-simplifier` imports keep working unchanged.
export {
  simplifyLedgerDebts,
  type LedgerBalance,
  type SimplifiedLedgerTransaction,
} from '@finmate/data-models';
