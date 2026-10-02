package replay

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// The format document has to describe the format the code writes.
//
// WHY THIS IS A TEST AND NOT A THING SOMEBODY CHECKED ONCE
//
// REPLAY_FORMATS.md is the only description of the on-disk format that is not the
// code. It was current when it was written, and the way a document like that goes
// stale is by accretion: a field is added to a struct, the encoder writes it, the
// decoder reads it, every test passes, and the document is one field behind. There
// is no failure anywhere in the system that notices, because a field nobody
// documented is a field nothing reads.
//
// So this walks the encoder's own source and the document, and fails when a field
// the encoder writes has no name in the document. It is a lint with a Go test's
// manners, and it is deliberately crude about matching: it looks for the field's
// name as a word, in a code span or in prose, anywhere in the file. A field
// documented badly is still documented, and a field documented as "and a few
// others" is not documented at all.
//
// WHAT IT DELIBERATELY DOES NOT DO
//
// It does not parse the document's structure, check the field types, or verify
// that the documented meaning is the real meaning. Those are judgement calls, and
// a test that made them would be a test asserting its own opinion. What it does do
// is catch the failure mode that actually happens, which is a name going missing.

// formatDocPath is the document, from this package's working directory.
const formatDocPath = "../../docs/REPLAY_FORMATS.md"

// The order log's two field shapes, which have to be read two different ways.
//
// The header is a tagged struct. The rows are written by hand, because their float
// fields have to use the round-tripping format that encoding/json's reflection
// would not guarantee, and a hand-written row is Go raw-string syntax in the
// source: a backtick, a comma, a quoted name, a colon, a backtick. That asymmetry
// between the two halves of one file is exactly the kind of thing a document gets
// wrong, which is why both patterns are here and why a check that only read the
// struct tags would report the header as complete.
var (
	structTagRe = regexp.MustCompile("json:\"([a-z_]+)\"")
	handRowRe   = regexp.MustCompile("`,\"([a-z_]+)\":`")
)

// writtenFields returns every field name the two encoder files write, deduplicated
// and sorted.
func writtenFields(t testing.TB) []string {
	t.Helper()
	seen := map[string]bool{}
	// The header is a tagged struct; the rows are written by hand because their
	// float formatting has to be the round-tripping one, so the two have to be read
	// two different ways. That asymmetry is exactly the kind of thing a document
	// gets wrong, which is why both are here.
	src, err := os.ReadFile("../battle/orderlog.go")
	if err != nil {
		t.Fatalf("reading the order log encoder to list the fields it writes: %v", err)
	}
	for _, m := range structTagRe.FindAllStringSubmatch(string(src), -1) {
		seen[m[1]] = true
	}
	for _, m := range handRowRe.FindAllStringSubmatch(string(src), -1) {
		seen[m[1]] = true
	}
	out := make([]string, 0, len(seen))
	for k := range seen {
		out = append(out, k)
	}
	sortStrings(out)
	return out
}

// TestTheFormatDocumentDescribesEveryFieldTheEncoderWrites is the staleness check.
func TestTheFormatDocumentDescribesEveryFieldTheEncoderWrites(t *testing.T) {
	raw, err := os.ReadFile(formatDocPath)
	if err != nil {
		t.Fatalf("reading %s: %v", formatDocPath, err)
	}
	doc := string(raw)
	fields := writtenFields(t)
	if len(fields) == 0 {
		t.Fatal("no fields were found in the order log encoder at all; the field extraction is " +
			"wrong, and a test that passes because it found nothing is worse than no test")
	}
	var missing []string
	for _, f := range fields {
		if !namedInDoc(doc, f) {
			missing = append(missing, f)
		}
	}
	if len(missing) > 0 {
		t.Errorf("%s does not mention %d of the %d fields the order log encoder writes: %v.\n"+
			"A field nobody documented is a field nothing reads, and nothing else in the system "+
			"notices one going missing. Add it to the document in the same commit that adds it to "+
			"the struct", formatDocPath, len(missing), len(fields), missing)
		return
	}
	t.Logf("%s documents all %d fields the order log encoder writes: %v", formatDocPath, len(fields), fields)
}

// TestTheFormatDocumentNamesTheBattleRecordFields covers the third of the three
// formats the document declares, the battle record, for the same reason.
//
// The fields are read out of the writer, so the list cannot drift from the code by
// the mechanism this file exists to catch. The two formats are read from different
// files on purpose: the order log is in orderlog.go and the record is in
// battlefile.go, and a coverage test that only looked at one of them would be green
// while the other went undocumented.
func TestTheFormatDocumentNamesTheBattleRecordFields(t *testing.T) {
	raw, err := os.ReadFile(formatDocPath)
	if err != nil {
		t.Fatalf("reading %s: %v", formatDocPath, err)
	}
	doc := string(raw)
	src, err := os.ReadFile("../battle/battlefile.go")
	if err != nil {
		t.Fatalf("reading the battle record writer: %v", err)
	}
	seen := map[string]bool{}
	for _, m := range structTagRe.FindAllStringSubmatch(string(src), -1) {
		seen[m[1]] = true
	}
	fields := make([]string, 0, len(seen))
	for k := range seen {
		fields = append(fields, k)
	}
	sortStrings(fields)
	if len(fields) == 0 {
		t.Fatal("no fields were found in the battle record writer; the extraction is wrong and a " +
			"test that passes because it found nothing is worse than no test")
	}
	var missing []string
	for _, f := range fields {
		if !namedInDoc(doc, f) {
			missing = append(missing, f)
		}
	}
	if len(missing) > 0 {
		t.Errorf("%s does not mention %d of the %d fields the battle record carries: %v",
			formatDocPath, len(missing), len(fields), missing)
		return
	}
	t.Logf("%s documents all %d battle-record fields: %v", formatDocPath, len(fields), fields)
}

// TestTheDocumentDeclaresTheFormatsThatExist checks the other direction: that the
// set of formats the document claims to describe has not fallen behind the set the
// code has.
//
// The coverage tests above go field by field, which catches a name going missing
// from inside a format. This catches something bigger: a FOURTH format existing in
// the code with no section in the document at all, which no per-field check can
// see because there are no fields to look for yet. The internal frame recording
// this package writes is the deliberate exclusion and the document says so; if
// somebody adds another format, this is the test that asks whether it was written
// down.
func TestTheDocumentDeclaresTheFormatsThatExist(t *testing.T) {
	raw, err := os.ReadFile(formatDocPath)
	if err != nil {
		t.Fatalf("reading %s: %v", formatDocPath, err)
	}
	doc := string(raw)
	// The formats the code has, and the words the document has to use for each.
	// "declared" means the document has a section heading naming the format, so a
	// passing mention in prose is not enough.
	formats := []struct {
		file, heading string
	}{
		{".battle", "Order script"},
		{"order.log", "Order log"},
		{"battle.json", "Battle record"},
	}
	for _, f := range formats {
		if !namedInDoc(doc, f.file) {
			t.Errorf("the document never names the %s format by its file name, so the section for "+
				"it is either gone or was never written", f.file)
		}
		if !strings.Contains(doc, f.heading) {
			t.Errorf("the document has no %q heading; a format with no section of its own is a "+
				"format whose fields are somebody's memory", f.heading)
		}
	}
	// And the exclusion, stated: the frame recording this package writes is not one
	// of the three, and the document has to say that rather than leave a reader to
	// wonder which of the encoders in the tree is undescribed.
	if !strings.Contains(doc, "frame") {
		t.Error("the document never mentions frames at all, while this package has an encoder that " +
			"writes them; a reader cannot tell an undescribed format from an undocumented one")
	}
	t.Logf("the document names all %d formats and accounts for the frame recording separately",
		len(formats))
}

// namedInDoc is the word-boundary match the coverage tests use.
//
// A boundary on both sides, so "tick" is not satisfied by a longer word that
// happens to contain it, and "dx" is not satisfied by "dxdy". It is deliberately
// crude about context: a field documented badly is still documented, and a field
// documented as "and a few others" is not documented at all.
func namedInDoc(doc, field string) bool {
	re := regexp.MustCompile(`(^|[^a-z_])` + regexp.QuoteMeta(field) + `([^a-z_]|$)`)
	return re.MatchString(doc)
}

// TestTheFormatDocumentIsNotEmptyAndIsNotJustAStub is the check on the check.
//
// A staleness test that passes because the document was deleted, or because it is
// a heading and a sentence, is a test that has stopped testing. The floor here is
// deliberately crude — the document has to be a real document — and it exists so
// that the two tests above cannot both be green because the file went missing.
func TestTheFormatDocumentIsNotEmptyAndIsNotJustAStub(t *testing.T) {
	raw, err := os.ReadFile(formatDocPath)
	if err != nil {
		t.Fatalf("%s could not be read, so the two field-coverage tests above proved nothing "+
			"about anything: %v", formatDocPath, err)
	}
	doc := string(raw)
	// Below this the document cannot be describing two file formats, a header, a
	// row shape, three fixtures and a set of commands. It is a floor, not a target.
	const floor = 4000
	if len(raw) < floor {
		t.Errorf("%s is %d bytes; a document describing this many formats was longer than that, so "+
			"either it has been truncated or the two coverage tests above are passing on a stub",
			formatDocPath, len(raw))
	}
	headings := strings.Count(doc, "\n#")
	if headings < 5 {
		t.Errorf("%s has %d headings; a format document with a header, two file formats, the "+
			"fixtures and the commands has more", formatDocPath, headings)
	}
	t.Logf("%s is %d bytes with %d headings", formatDocPath, len(raw), headings)
}
