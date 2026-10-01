package cause

import (
	"testing"

	"mbclone/simulation/internal/model"
)

// TestLogRetentionBounds is a regression test for the 2026-10-01 panic:
// Append advanced the logical base by the total excess on every overflowing
// append instead of by one, so base ran triangularly past the end of the
// buffer and Rows()/compact() panicked with slice bounds out of range on
// every real run. Appending far past the cap (including past the 2x
// compaction trigger) must keep exactly maxRows retained rows with the
// newest IDs, and must never panic.
func TestLogRetentionBounds(t *testing.T) {
	const maxRows = 100
	const total = 5 * maxRows
	l := NewLog(maxRows)
	for i := 0; i < total; i++ {
		l.Append(Row{Kind: model.KindTown, Entity: 1, Field: "unrest", Tick: i, System: "test"})
	}
	if got := l.Len(); got != maxRows {
		t.Fatalf("Len() = %d, want %d", got, maxRows)
	}
	if got := l.DroppedOldest(); got != total-maxRows {
		t.Fatalf("DroppedOldest() = %d, want %d", got, total-maxRows)
	}
	rows := l.Rows()
	if len(rows) != maxRows {
		t.Fatalf("len(Rows()) = %d, want %d", len(rows), maxRows)
	}
	for i, r := range rows {
		wantID := total - maxRows + 1 + i
		if r.ID != wantID {
			t.Fatalf("rows[%d].ID = %d, want %d", i, r.ID, wantID)
		}
		if _, ok := l.Row(r.ID); !ok {
			t.Fatalf("Row(%d) not found", r.ID)
		}
	}
	// Dropped IDs must report not-found, not panic.
	if _, ok := l.Row(1); ok {
		t.Fatal("Row(1) should have been dropped")
	}
	if _, ok := l.Row(total - maxRows); ok {
		t.Fatalf("Row(%d) should have been dropped", total-maxRows)
	}
}
