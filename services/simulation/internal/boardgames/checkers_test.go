package boardgames

import (
	"testing"
)

func TestNewGamePieceCount(t *testing.T) {
	g := NewGame()
	var red, black int
	for r := 0; r < 8; r++ {
		for c := 0; c < 8; c++ {
			switch g.Board[r][c] {
			case RedMan:
				red++
			case BlackMan:
				black++
			}
		}
	}
	if red != 12 || black != 12 {
		t.Errorf("expected 12 pieces each, got red=%d black=%d", red, black)
	}
	if g.Turn != Red {
		t.Errorf("expected Red to move first")
	}
}

func TestOpeningMoves(t *testing.T) {
	g := NewGame()
	moves := g.LegalMoves()
	// 7 opening moves in American checkers (the 4th rank men have options).
	if len(moves) != 7 {
		t.Errorf("expected 7 opening moves, got %d", len(moves))
	}
}

func TestMandatoryCapture(t *testing.T) {
	g := &Game{Turn: Red}
	// Red man at (5,2), Black man at (4,3), empty at (3,4).
	g.Board[5][2] = RedMan
	g.Board[4][3] = BlackMan
	moves := g.LegalMoves()
	if len(moves) != 1 {
		t.Fatalf("expected 1 mandatory capture, got %d", len(moves))
	}
	m := moves[0]
	if len(m.Steps) != 2 || m.Steps[1] != [2]int{3, 4} {
		t.Errorf("expected capture to (3,4), got %v", m.Steps)
	}
}

func TestApplyCapture(t *testing.T) {
	g := &Game{Turn: Red}
	g.Board[5][2] = RedMan
	g.Board[4][3] = BlackMan
	moves := g.LegalMoves()
	if err := g.Apply(moves[0]); err != nil {
		t.Fatalf("apply failed: %v", err)
	}
	if g.Board[4][3] != Empty {
		t.Error("captured piece should be removed")
	}
	if g.Board[3][4] != RedMan {
		t.Error("piece should land at (3,4)")
	}
	if g.Turn != Black {
		t.Error("turn should switch to Black")
	}
}

func TestCrowning(t *testing.T) {
	g := &Game{Turn: Red}
	g.Board[1][2] = RedMan
	moves := g.LegalMoves()
	// Find the move to (0,1) or (0,3).
	applied := false
	for _, m := range moves {
		if m.Steps[len(m.Steps)-1] == [2]int{0, 1} {
			if err := g.Apply(m); err != nil {
				t.Fatalf("apply failed: %v", err)
			}
			applied = true
			break
		}
	}
	if !applied {
		t.Fatal("no crowning move found")
	}
	if g.Board[0][1] != RedKing {
		t.Errorf("man should crown to king, got %d", g.Board[0][1])
	}
}

func TestWinnerByCapture(t *testing.T) {
	g := &Game{Turn: Red}
	g.Board[5][2] = RedMan
	// Black has no pieces.
	if w := g.Winner(); w != Red {
		t.Errorf("expected Red winner, got %d", w)
	}
}

func TestWinnerByBlock(t *testing.T) {
	g := &Game{Turn: Black}
	// Black man at (7,0) on the back rank cannot move (Black moves down).
	g.Board[7][0] = BlackMan
	g.Board[5][2] = RedMan
	if w := g.Winner(); w != Red {
		t.Errorf("expected Red winner by block, got %d", w)
	}
}

func TestIllegalMoveRejected(t *testing.T) {
	g := NewGame()
	bad := Move{Steps: [][2]int{{5, 0}, {0, 0}}}
	if err := g.Apply(bad); err == nil {
		t.Error("expected illegal move to be rejected")
	}
}

func TestMultiJump(t *testing.T) {
	g := &Game{Turn: Red}
	// Red at (5,0), Black at (4,1) and (2,3). Red jumps (5,0)->(3,2)->(1,4).
	g.Board[5][0] = RedMan
	g.Board[4][1] = BlackMan
	g.Board[2][3] = BlackMan
	moves := g.LegalMoves()
	found := false
	for _, m := range moves {
		if len(m.Steps) == 3 {
			found = true
			if err := g.Apply(m); err != nil {
				t.Fatalf("multi-jump apply failed: %v", err)
			}
			break
		}
	}
	if !found {
		t.Fatal("expected a multi-jump capture")
	}
	if g.Board[4][1] != Empty || g.Board[2][3] != Empty {
		t.Error("both captured pieces should be removed")
	}
	if g.Board[1][4] != RedMan {
		t.Error("piece should end at (1,4)")
	}
}
