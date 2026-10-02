package main

import (
	"crypto/sha1"
	"encoding/base64"
	"net"
)

const wsGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

func wsAcceptKey(key string) string {
	h := sha1.New()
	h.Write([]byte(key + wsGUID))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

// wsWriteText writes a single unmasked text frame.
func wsWriteText(conn net.Conn, payload []byte) error {
	n := len(payload)
	header := []byte{0x81}
	if n < 126 {
		header = append(header, byte(n))
	} else if n < 65536 {
		header = append(header, 126, byte(n>>8), byte(n))
	} else {
		header = append(header, 127,
			byte(n>>56), byte(n>>48), byte(n>>32), byte(n>>24),
			byte(n>>16), byte(n>>8), byte(n))
	}
	if _, err := conn.Write(header); err != nil {
		return err
	}
	_, err := conn.Write(payload)
	return err
}
