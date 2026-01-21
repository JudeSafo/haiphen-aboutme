// internal/util/jwtmeta.go
package util

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type jwtClaimsMeta struct {
	Exp int64 `json:"exp"`
	Iat int64 `json:"iat"`
}

func JWTExpiry(token string) (time.Time, error) {
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return time.Time{}, errors.New("invalid jwt: not enough segments")
	}
	payloadB64 := parts[1]
	payloadRaw, err := base64.RawURLEncoding.DecodeString(payloadB64)
	if err != nil {
		return time.Time{}, err
	}
	var m jwtClaimsMeta
	if err := json.Unmarshal(payloadRaw, &m); err != nil {
		return time.Time{}, err
	}
	if m.Exp == 0 {
		return time.Time{}, errors.New("jwt missing exp")
	}
	return time.Unix(m.Exp, 0), nil
}