package battle

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"io"
)

// DeriveBattleSeed derives a battle's seed from the campaign's seed, the
// campaign's battle counter, and the two parties' ids.
//
// It is HMAC-SHA256 keyed by the campaign seed over the counter and both
// party ids, truncated to 64 bits. Two properties matter:
//
//   - No two battles share a seed. The counter advances once per battle, so
//     even a rematch between the same parties lands on a fresh seed.
//   - The seed commits to who fights whom. Swapping attacker and defender, or
//     changing either party, changes the seed, so a battle cannot silently
//     reuse another battle's randomness.
//
// The party ids are length-prefixed in the message so that ("ab", "c") and
// ("a", "bc") derive different seeds: without the lengths those pairs would
// hash the same bytes and collide.
func DeriveBattleSeed(campaignSeed, battleCounter uint64, attackerID, defenderID string) uint64 {
	mac := hmac.New(sha256.New, uint64Bytes(campaignSeed))
	var ctr [8]byte
	binary.BigEndian.PutUint64(ctr[:], battleCounter)
	mac.Write(ctr[:])
	writePrefixed(mac, attackerID)
	writePrefixed(mac, defenderID)
	sum := mac.Sum(nil)
	return binary.BigEndian.Uint64(sum[:8])
}

func uint64Bytes(v uint64) []byte {
	var b [8]byte
	binary.BigEndian.PutUint64(b[:], v)
	return b[:]
}

func writePrefixed(w io.Writer, s string) {
	var ln [8]byte
	binary.BigEndian.PutUint64(ln[:], uint64(len(s)))
	w.Write(ln[:])
	w.Write([]byte(s))
}
