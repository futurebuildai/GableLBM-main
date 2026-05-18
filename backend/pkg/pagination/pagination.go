package pagination

import (
	"net/http"
	"strconv"
)

const DefaultLimit = 50
const MaxLimit = 200

type Page struct {
	Limit  int
	Offset int
}

// FromRequest extracts pagination params from query string (?limit=50&offset=0)
func FromRequest(r *http.Request) Page {
	p := Page{Limit: DefaultLimit, Offset: 0}
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= MaxLimit {
			p.Limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			p.Offset = n
		}
	}
	return p
}

type PagedResponse[T any] struct {
	Data   []T `json:"data"`
	Total  int `json:"total"`
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}
