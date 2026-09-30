// Package config loads every tunable constant for the simulation from one
// commented file, per CONSTITUTION.md section 1.2 ("No number hides in code").
//
// The format is a small, deliberately boring subset of TOML: comments with #,
// [section] headers, and key = number or key = "string". It is parsed here
// rather than pulled from a library because the simulation carries no
// third-party dependencies; see docs/DECISIONS in this package for the
// rationale and the exact grammar.
//
// Load returns an error naming the file and line for any syntax problem, and
// Missing for any key the balance file omits. A silently defaulted constant is
// exactly the failure mode CONSTITUTION.md section 1.2 exists to prevent, so
// there are no defaults in the loader at all: the file is the whole truth.
package config

import (
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
)

// file is the parsed key/value structure of a balance file, keyed by
// "section.key" with the root section named "".
type file struct {
	values  map[string]float64
	strings map[string]string
	lines   map[string]int
}

// MissingError reports balance keys that a required key was absent.
type MissingError struct {
	File string
	Keys []string
}

func (e *MissingError) Error() string {
	return fmt.Sprintf("config: %s is missing required keys: %s",
		e.File, strings.Join(e.Keys, ", "))
}

func parseFile(path string) (*file, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("config: reading %s: %w", path, err)
	}
	f := &file{
		values:  map[string]float64{},
		strings: map[string]string{},
		lines:   map[string]int{},
	}
	section := ""
	for i, line := range strings.Split(string(raw), "\n") {
		lineno := i + 1
		text := strings.TrimSpace(line)
		if text == "" || strings.HasPrefix(text, "#") {
			continue
		}
		if strings.HasPrefix(text, "[") {
			if !strings.HasSuffix(text, "]") {
				return nil, fmt.Errorf("config: %s:%d: unterminated section header %q", path, lineno, text)
			}
			section = strings.TrimSpace(text[1 : len(text)-1])
			if section == "" {
				return nil, fmt.Errorf("config: %s:%d: empty section header", path, lineno)
			}
			continue
		}
		eq := strings.Index(text, "=")
		if eq < 0 {
			return nil, fmt.Errorf("config: %s:%d: expected key = value, got %q", path, lineno, text)
		}
		key := strings.TrimSpace(text[:eq])
		val := strings.TrimSpace(text[eq+1:])
		// Strip a trailing comment, but only outside a quoted string so that
		// a value like "a # b" is not mangled.
		val = stripComment(val)
		if key == "" {
			return nil, fmt.Errorf("config: %s:%d: empty key", path, lineno)
		}
		full := key
		if section != "" {
			full = section + "." + key
		}
		if _, dup := f.values[full]; dup {
			return nil, fmt.Errorf("config: %s:%d: duplicate key %q", path, lineno, full)
		}
		if _, dup := f.strings[full]; dup {
			return nil, fmt.Errorf("config: %s:%d: duplicate key %q", path, lineno, full)
		}
		f.lines[full] = lineno
		if strings.HasPrefix(val, "\"") {
			s, err := strconv.Unquote(val)
			if err != nil {
				return nil, fmt.Errorf("config: %s:%d: bad quoted value for %q: %w", path, lineno, full, err)
			}
			f.strings[full] = s
			continue
		}
		n, err := strconv.ParseFloat(val, 64)
		if err != nil {
			return nil, fmt.Errorf("config: %s:%d: %q is not a number: %w", path, lineno, full, err)
		}
		f.values[full] = n
	}
	return f, nil
}

// stripComment removes a trailing # comment that is not inside quotes.
func stripComment(s string) string {
	inQuote := false
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '"':
			inQuote = !inQuote
		case '#':
			if !inQuote {
				return strings.TrimSpace(s[:i])
			}
		}
	}
	return strings.TrimSpace(s)
}

// loader accumulates required keys so that all misses are reported at once
// rather than one per run.
type loader struct {
	path    string
	f       *file
	missing []string
	seen    map[string]bool
}

// f64 fetches a required float, recording the key as consumed.
func (l *loader) f64(key string) float64 {
	l.seen[key] = true
	v, ok := l.f.values[key]
	if !ok {
		l.missing = append(l.missing, key)
		return 0
	}
	return v
}

// str fetches a required string value.
func (l *loader) str(key string) string {
	l.seen[key] = true
	v, ok := l.f.strings[key]
	if !ok {
		l.missing = append(l.missing, key)
		return ""
	}
	return v
}

// finish reports any key in the file that no caller asked for. An unread key
// usually means a typo in the balance file, which would otherwise leave the
// intended value unused while the code used a different one.
func (l *loader) finish() error {
	var unused []string
	for k := range l.f.values {
		if !l.seen[k] {
			unused = append(unused, k)
		}
	}
	for k := range l.f.strings {
		if !l.seen[k] {
			unused = append(unused, k)
		}
	}
	if len(unused) > 0 {
		sort.Strings(unused)
		return fmt.Errorf("config: %s has keys no system reads (typo or dead constant): %s",
			l.path, strings.Join(unused, ", "))
	}
	return nil
}
