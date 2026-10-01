// Package encyclopedia provides read-only lore entries for the campaign
// client (Tier 6).
//
// Bannerlord's encyclopedia catalogs every known lord, faction, settlement,
// and troop type, with their relationships and current status. This package
// offers the same for the simulation: given the world state, it renders
// human-readable entries for towns, rulers, clans, and sides.
//
// It is deliberately read-only and dependency-light: it imports only the
// model package, never the sim engine. The campaign client calls it to
// populate its encyclopedia UI; the simulation itself never invokes it.
// Nothing here mutates state, stages writes, or reads the cause log.
package encyclopedia

import (
	"fmt"
	"sort"
	"strings"

	"mbclone/simulation/internal/model"
)

// Entry is a single encyclopedia article.
type Entry struct {
	Kind  string // "town", "ruler", "clan", "side"
	ID    int
	Title string
	Body  string
}

// TownEntry renders a town's encyclopedia article.
func TownEntry(s *model.State, id int) *Entry {
	t := s.Towns[id]
	if t == nil {
		return nil
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "%s", t.Name)
	if t.IsPort {
		sb.WriteString(" (port)")
	}
	sb.WriteString("\n")

	// Holder.
	if t.Holder >= 0 {
		if r := s.Leaders[t.Holder]; r != nil {
			fmt.Fprintf(&sb, "Held by %s", r.Name)
			if c := s.Organizations[r.OrganizationID]; c != nil {
				fmt.Fprintf(&sb, " of clan %s", c.Name)
			}
			sb.WriteString(".\n")
		}
	} else {
		sb.WriteString("Unheld.\n")
	}

	// Vitals.
	fmt.Fprintf(&sb, "Population %.0f, prosperity %.0f%%, loyalty %.0f%%.\n",
		t.Population, t.Prosperity*100, t.Loyalty*100)
	if t.IsBesieged {
		sb.WriteString("Under siege.\n")
	}
	if t.Blockade > 0.01 {
		fmt.Fprintf(&sb, "Blockaded (%.0f%%).\n", t.Blockade*100)
	}
	if t.Unrest > 0.3 {
		fmt.Fprintf(&sb, "Unrest is high (%.0f%%).\n", t.Unrest*100)
	}

	// Garrison.
	fmt.Fprintf(&sb, "Garrison %.0f, militia %.0f.\n", t.Garrison, t.Militia)

	return &Entry{Kind: "town", ID: id, Title: t.Name, Body: sb.String()}
}

// RulerEntry renders a ruler's encyclopedia article.
func RulerEntry(s *model.State, id int) *Entry {
	r := s.Leaders[id]
	if r == nil {
		return nil
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "%s", r.Name)
	if !r.IsAlive {
		sb.WriteString(" (deceased)")
	}
	sb.WriteString("\n")

	// Rank.
	rankName := rankName(r.Tier)
	fmt.Fprintf(&sb, "%s", rankName)

	// Clan and side.
	if c := s.Organizations[r.OrganizationID]; c != nil {
		fmt.Fprintf(&sb, " of clan %s", c.Name)
	}
	if side := s.Sides[r.SideID]; side != nil {
		fmt.Fprintf(&sb, ", serving %s", side.Name)
	}
	sb.WriteString(".\n")

	// Status.
	if r.CapturedBy >= 0 {
		if c := s.Leaders[r.CapturedBy]; c != nil {
			fmt.Fprintf(&sb, "Prisoner of %s.\n", c.Name)
		} else {
			sb.WriteString("Held prisoner.\n")
		}
	}
	if r.TownID >= 0 {
		if t := s.Towns[r.TownID]; t != nil {
			fmt.Fprintf(&sb, "Stationed in %s.\n", t.Name)
		}
	} else if r.PartyID >= 0 {
		sb.WriteString("In the field.\n")
	}

	fmt.Fprintf(&sb, "Renown %.0f, influence %.0f, age %.0f.\n",
		r.Renown, r.Influence, r.Age)

	return &Entry{Kind: "ruler", ID: id, Title: r.Name, Body: sb.String()}
}

// ClanEntry renders a clan's encyclopedia article.
func ClanEntry(s *model.State, id int) *Entry {
	c := s.Organizations[id]
	if c == nil {
		return nil
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "Clan %s\n", c.Name)

	if l := s.Leaders[c.LeaderID]; l != nil {
		fmt.Fprintf(&sb, "Led by %s.\n", l.Name)
	}
	fmt.Fprintf(&sb, "Tier %d, renown %.0f.\n", c.Tier, c.Renown)

	if len(c.MemberIDs) > 0 {
		sb.WriteString("Members: ")
		var names []string
		for _, mid := range c.MemberIDs {
			if m := s.Leaders[mid]; m != nil {
				names = append(names, m.Name)
			}
		}
		sort.Strings(names)
		sb.WriteString(strings.Join(names, ", "))
		sb.WriteString(".\n")
	}

	if len(c.FiefIDs) > 0 {
		sb.WriteString("Fiefs: ")
		var names []string
		for _, fid := range c.FiefIDs {
			if t := s.Towns[fid]; t != nil {
				names = append(names, t.Name)
			}
		}
		sort.Strings(names)
		sb.WriteString(strings.Join(names, ", "))
		sb.WriteString(".\n")
	}

	return &Entry{Kind: "clan", ID: id, Title: c.Name, Body: sb.String()}
}

// SideEntry renders a faction's encyclopedia article.
func SideEntry(s *model.State, id int) *Entry {
	d := s.Sides[id]
	if d == nil {
		return nil
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "%s\n", d.Name)

	if l := s.Leaders[d.LeaderID]; l != nil {
		fmt.Fprintf(&sb, "Led by %s.\n", l.Name)
	}
	fmt.Fprintf(&sb, "Treasury %.0f.\n", d.Treasury)

	// Count towns held.
	towns := 0
	for _, t := range s.Towns {
		if t != nil && t.HolderSide == id {
			towns++
		}
	}
	fmt.Fprintf(&sb, "Holds %d towns.\n", towns)

	return &Entry{Kind: "side", ID: id, Title: d.Name, Body: sb.String()}
}

// rankName maps ruler tier to a display name.
func rankName(tier int) string {
	switch tier {
	case 0:
		return "Faction leader"
	case 1:
		return "Governor"
	case 2:
		return "Lord"
	case 3:
		return "Warlord"
	case 4:
		return "Mercenary captain"
	default:
		return "Noble"
	}
}

// Search returns entries whose titles contain the query (case-insensitive).
func Search(s *model.State, query string) []Entry {
	q := strings.ToLower(query)
	var out []Entry
	for id, t := range s.Towns {
		if t != nil && strings.Contains(strings.ToLower(t.Name), q) {
			if e := TownEntry(s, id); e != nil {
				out = append(out, *e)
			}
		}
	}
	for id, r := range s.Leaders {
		if r != nil && strings.Contains(strings.ToLower(r.Name), q) {
			if e := RulerEntry(s, id); e != nil {
				out = append(out, *e)
			}
		}
	}
	for id, c := range s.Organizations {
		if c != nil && strings.Contains(strings.ToLower(c.Name), q) {
			if e := ClanEntry(s, id); e != nil {
				out = append(out, *e)
			}
		}
	}
	for id, d := range s.Sides {
		if d != nil && strings.Contains(strings.ToLower(d.Name), q) {
			if e := SideEntry(s, id); e != nil {
				out = append(out, *e)
			}
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Kind != out[j].Kind {
			return out[i].Kind < out[j].Kind
		}
		return out[i].Title < out[j].Title
	})
	return out
}
