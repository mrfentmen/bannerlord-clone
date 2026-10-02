//go:build !race

package battle

// raceDetectorEnabled is false in an ordinary build. See the -race twin of this
// file for what it is for and what the effect size is.
const raceDetectorEnabled = false
