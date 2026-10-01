// Package boardgames implements American checkers logic for tavern games.
//
// Bannerlord has six culture-specific board games playable in taverns for
// wagers. In the modern American setting, the equivalent is checkers —
// played in bars and taverns everywhere, with money on the line.
//
// This is a pure logic package with no simulation dependencies. The
// campaign client uses it for the game UI; the sim does not need to know
// about it. Wager settlement (money changing hands) is the client's
// responsibility via player orders.
//
// Rules implemented: American checkers (English draughts) on 8x8.
//   - Men move diagonally forward one square; kings move diagonally any
//     distance (flying kings, American style).
//   - Captures are mandatory and multi-jump sequences are a single move.
//   - Men crown on reaching the far rank.
//   - Win by capturing all opponent pieces or blocking all moves.
package boardgames

import (
	"errors"
	"fmt"
)

// Piece values.
const (
	Empty     = 0
	RedMan    = 1
	RedKing   = 2
	BlackMan  = -1
	BlackKing = -2
)

// Red moves "up" (decreasing row), Black moves "down" (increasing row).
const (
	Red   = 1
	Black = -1
)

// Board is an 8x8 grid. Only dark squares are used; pieces sit on
// squares where (row+col) is odd.
type Board [8][8]int

// Move is a sequence of positions: the start square followed by each
// landing square. A single-step move has length 2; a multi-jump has more.
type Move struct {
	Steps [][2]int // each [row, col]
}

// Game holds the board and whose turn it is.
type Game struct {
	Board Board
	Turn  int // Red or Black
}

// NewGame returns the standard starting position.
func NewGame() *Game {
	g := &Game{Turn: Red}
	for r := 0; r < 3; r++ {
		for c := 0; c < 8; c++ {
			if (r+c)%2 == 1 {
				g.Board[r][c] = BlackMan
			}
		}
	}
	for r := 5; r < 8; r++ {
		for c := 0; c < 8; c++ {
			if (r+c)%2 == 1 {
				g.Board[r][c] = RedMan
			}
		}
	}
	return g
}

// inBounds reports whether (r, c) is on the board.
func inBounds(r, c int) bool {
	return r >= 0 && r < 8 && c >= 0 && c < 8
}

// isKing reports whether the piece is a king.
func isKing(p int) bool {
	return p == RedKing || p == BlackKing
}

// belongsTo reports whether piece p belongs to side s.
func belongsTo(p, s int) bool {
	if s == Red {
		return p == RedMan || p == RedKing
	}
	return p == BlackMan || p == BlackKing
}

// opponentOf returns the opponent's piece signs.
func opponentOf(s int) (man, king int) {
	if s == Red {
		return BlackMan, BlackKing
	}
	return RedMan, RedKing
}

// LegalMoves returns all legal moves for the side to move.
// If captures are available, only captures are returned (mandatory capture).
func (g *Game) LegalMoves() []Move {
	var captures []Move
	var quiet []Move
	for r := 0; r < 8; r++ {
		for c := 0; c < 8; c++ {
			p := g.Board[r][c]
			if !belongsTo(p, g.Turn) {
				continue
			}
			captures = append(captures, g.capturesFrom(r, c)...)
			if len(captures) == 0 {
				quiet = append(quiet, g.quietFrom(r, c)...)
			}
		}
	}
	if len(captures) > 0 {
		return captures
	}
	return quiet
}

// quietFrom returns non-capturing moves for the piece at (r, c).
func (g *Game) quietFrom(r, c int) []Move {
	var moves []Move
	p := g.Board[r][c]
	dirs := moveDirs(p, g.Turn)
	for _, d := range dirs {
		nr, nc := r+d[0], c+d[1]
		if !isKing(p) {
			// Men move one step.
			if inBounds(nr, nc) && g.Board[nr][nc] == Empty {
				moves = append(moves, Move{Steps: [][2]int{{r, c}, {nr, nc}}})
			}
		} else {
			// Flying kings: any distance along the diagonal until blocked.
			for nr, nc = r+d[0], c+d[1]; inBounds(nr, nc); nr, nc = nr+d[0], nc+d[1] {
				if g.Board[nr][nc] != Empty {
					break
				}
				moves = append(moves, Move{Steps: [][2]int{{r, c}, {nr, nc}}})
			}
		}
	}
	return moves
}

// capturesFrom returns all capture sequences starting from (r, c).
func (g *Game) capturesFrom(r, c int) []Move {
	var moves []Move
	p := g.Board[r][c]
	oppMan, oppKing := opponentOf(g.Turn)
	dirs := [][2]int{{-1, -1}, {-1, 1}, {1, -1}, {1, 1}}
	if !isKing(p) {
		// Men capture forward only (American checkers).
		if g.Turn == Red {
			dirs = [][2]int{{-1, -1}, {-1, 1}}
		} else {
			dirs = [][2]int{{1, -1}, {1, 1}}
		}
	}
	var search func(brd Board, cr, cc int, path [][2]int)
	search = func(brd Board, cr, cc int, path [][2]int) {
		found := false
		for _, d := range dirs {
			mr, mc := cr+d[0], cc+d[1] // square with the victim
			lr, lc := cr+2*d[0], cc+2*d[1]
			if !isKing(p) {
				// Man capture: adjacent victim, empty landing.
				if !inBounds(lr, lc) || brd[lr][lc] != Empty {
					continue
				}
				if !inBounds(mr, mc) {
					continue
				}
				victim := brd[mr][mc]
				if victim != oppMan && victim != oppKing {
					continue
				}
				found = true
				nb := brd
				nb[mr][mc] = Empty
				nb[cr][cc] = Empty
				nb[lr][lc] = p
				search(nb, lr, lc, append(path, [2]int{lr, lc}))
			} else {
				// Flying king capture: slide until finding a victim with
				// empty squares beyond, land on any empty square past it.
				for vr, vc := cr+d[0], cc+d[1]; inBounds(vr, vc); vr, vc = vr+d[0], vc+d[1] {
					victim := brd[vr][vc]
					if victim == Empty {
						continue
					}
					if victim != oppMan && victim != oppKing {
						break // blocked by own piece
					}
					// Found a victim; try each landing square beyond.
					for lr2, lc2 := vr+d[0], vc+d[1]; inBounds(lr2, lc2) && brd[lr2][lc2] == Empty; lr2, lc2 = lr2+d[0], lc2+d[1] {
						found = true
						nb := brd
						nb[vr][vc] = Empty
						nb[cr][cc] = Empty
						nb[lr2][lc2] = p
						search(nb, lr2, lc2, append(path, [2]int{lr2, lc2}))
					}
					break // only the first victim in this direction
				}
			}
		}
		if !found && len(path) > 1 {
			moves = append(moves, Move{Steps: path})
		}
	}
	search(g.Board, r, c, [][2]int{{r, c}})
	return moves
}

// moveDirs returns the move directions for a piece.
func moveDirs(p, turn int) [][2]int {
	if isKing(p) {
		return [][2]int{{-1, -1}, {-1, 1}, {1, -1}, {1, 1}}
	}
	if turn == Red {
		return [][2]int{{-1, -1}, {-1, 1}}
	}
	return [][2]int{{1, -1}, {1, 1}}
}

// Apply executes a move, returning an error if it is illegal.
// It handles captures (removing jumped pieces) and crowning.
func (g *Game) Apply(m Move) error {
	legal := g.LegalMoves()
	valid := false
	for _, lm := range legal {
		if movesEqual(lm, m) {
			valid = true
			break
		}
	}
	if !valid {
		return errors.New("illegal move")
	}
	if len(m.Steps) < 2 {
		return errors.New("move has no steps")
	}
	sr, sc := m.Steps[0][0], m.Steps[0][1]
	p := g.Board[sr][sc]
	g.Board[sr][sc] = Empty

	// Walk the path, removing captured pieces.
	cr, cc := sr, sc
	for i := 1; i < len(m.Steps); i++ {
		nr, nc := m.Steps[i][0], m.Steps[i][1]
		dr, dc := nr-cr, nc-cc
		// Normalize direction.
		if dr != 0 {
			dr /= abs(dr)
		}
		if dc != 0 {
			dc /= abs(dc)
		}
		// Remove any pieces jumped over.
		for rr, cc2 := cr+dr, cc+dc; rr != nr || cc2 != nc; rr, cc2 = rr+dr, cc2+dc {
			g.Board[rr][cc2] = Empty
		}
		cr, cc = nr, nc
	}
	// Crown men reaching the far rank.
	if p == RedMan && cr == 0 {
		p = RedKing
	} else if p == BlackMan && cr == 7 {
		p = BlackKing
	}
	g.Board[cr][cc] = p

	// Switch turn.
	if g.Turn == Red {
		g.Turn = Black
	} else {
		g.Turn = Red
	}
	return nil
}

// Winner returns Red, Black, or 0 if the game is not over.
// A side loses when it has no pieces or no legal moves.
func (g *Game) Winner() int {
	var redPieces, blackPieces int
	for r := 0; r < 8; r++ {
		for c := 0; c < 8; c++ {
			switch g.Board[r][c] {
			case RedMan, RedKing:
				redPieces++
			case BlackMan, BlackKing:
				blackPieces++
			}
		}
	}
	if redPieces == 0 {
		return Black
	}
	if blackPieces == 0 {
		return Red
	}
	if len(g.LegalMoves()) == 0 {
		// Side to move is blocked.
		if g.Turn == Red {
			return Black
		}
		return Red
	}
	return 0
}

// movesEqual reports whether two moves have identical steps.
func movesEqual(a, b Move) bool {
	if len(a.Steps) != len(b.Steps) {
		return false
	}
	for i := range a.Steps {
		if a.Steps[i] != b.Steps[i] {
			return false
		}
	}
	return true
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// String renders the board for debugging.
func (g *Game) String() string {
	s := ""
	for r := 0; r < 8; r++ {
		for c := 0; c < 8; c++ {
			switch g.Board[r][c] {
			case RedMan:
				s += "r "
			case RedKing:
				s += "R "
			case BlackMan:
				s += "b "
			case BlackKing:
				s += "B "
			default:
				s += ". "
			}
		}
		s += "\n"
	}
	return fmt.Sprintf("turn=%d\n%s", g.Turn, s)
}
