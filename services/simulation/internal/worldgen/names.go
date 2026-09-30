package worldgen

// Names are generated from syllable tables rather than drawn from a list of
// real people. CONSTITUTION.md section 6.2 bans real people as characters, and
// generating rather than sampling is the strongest possible compliance: there
// is no list that could be argued to contain a real person's name, because there
// is no list of names at all.
//
// The tables are deliberately short and phonetic. The result should read like a
// plausible name, not like a real one, and no combination should be traceable to
// a specific individual.

var nameStarts = []string{
	"al", "ar", "bren", "cal", "cor", "dav", "dun", "eld", "far", "fen",
	"gar", "hal", "ith", "jor", "kel", "lam", "mar", "nor", "orv", "pel",
	"ren", "sel", "tor", "ulv", "var", "wel", "yor", "zan", "bre", "cad",
	"dro", "eth", "fim", "gun", "hes", "ivo", "jul", "kem", "lun", "mor",
}

var nameMiddles = []string{
	"a", "e", "i", "o", "u", "ae", "ei", "ia", "or", "ur", "en", "el", "ar", "ir",
}

var nameEnds = []string{
	"dan", "ric", "wyn", "mar", "ton", "dis", "ren", "ver", "lin", "dor",
	"mund", "stan", "gard", "helm", "ir", "us", "ath", "iel", "ona", "ric",
	"red", "nis", "lyn", "dain", "mar", "ghen", "thar", "van", "ren", "sa",
}

// rulerName builds a fictional name.
func rulerName(r interface {
	Intn(int) int
}, sideName string) string {
	_ = sideName
	s := nameStarts[r.Intn(len(nameStarts))]
	if r.Intn(3) != 0 {
		s += nameMiddles[r.Intn(len(nameMiddles))]
	}
	s += nameEnds[r.Intn(len(nameEnds))]
	return capitalise(s)
}

// settlementName builds a fictional place name. The state is not appended: the
// state is a real place and belongs on the map as itself, and mixing a fictional
// name with a real state is how a map starts to look as though it is claiming
// to be a real gazetteer.
func settlementName(r interface {
	Intn(int) int
}, state string, pop float64) string {
	_ = state
	prefix := placePrefix[r.Intn(len(placePrefix))]
	base := placeRoot[r.Intn(len(placeRoot))]
	suffix := ""
	if r.Intn(2) == 0 {
		suffix = placeSuffix[r.Intn(len(placeSuffix))]
	}
	name := prefix + base + suffix
	// A large place gets a name that sounds like a city rather than a hamlet.
	// This is a real pattern in settlement naming and it makes the map legible
	// at a glance, which matters for a player scanning a campaign map.
	if pop > placeCityThreshold && r.Intn(2) == 0 {
		name += placeSuffix[r.Intn(len(placeSuffix))]
	}
	return capitalise(name)
}

// villageName builds a fictional name for a food-producing settlement.
func villageName(r interface {
	Intn(int) int
}) string {
	prefix := villagePrefix[r.Intn(len(villagePrefix))]
	root := placeRoot[r.Intn(len(placeRoot))]
	return capitalise(prefix + root)
}

var placePrefix = []string{
	"ash", "bel", "brook", "cedar", "dal", "eagle", "fair", "glen", "har",
	"iron", "kirk", "lake", "marsh", "north", "oak", "pine", "queen", "red",
	"stone", "thorn", "union", "vale", "west", "york", "black", "cold",
	"deep", "east", "ford", "green", "high", "long", "mil", "new", "old",
	"ridge", "salt", "sand", "spring", "white", "wild", "wood",
}

var placeRoot = []string{
	"bury", "chester", "dale", "field", "ford", "gate", "haven", "ing",
	"ley", "mouth", "port", "ridge", "stead", "ton", "ville", "worth",
	"wood", "brook", "hill", "mere", "combe", "shaw", "thorpe", "wick",
	"bourne", "cliff", "dale", "garth", "hollow", "minster", "stead",
}

var placeSuffix = []string{
	"ton", "ville", "bury", "ford", "field", "wood", "hill", "creek",
	"haven", "port", "burg", "stad", "shire", "mouth", "bridge", "point",
}

var villagePrefix = []string{
	"little", "upper", "lower", "north", "south", "east", "west", "old",
	"new", "great", "high", "long",
}

// placeCityThreshold is the population above which a settlement is likely to
// be a city, and so is given a longer name.
const placeCityThreshold = 120000

func capitalise(s string) string {
	if s == "" {
		return s
	}
	b := []byte(s)
	if b[0] >= 'a' && b[0] <= 'z' {
		b[0] = b[0] - 'a' + 'A'
	}
	return string(b)
}
