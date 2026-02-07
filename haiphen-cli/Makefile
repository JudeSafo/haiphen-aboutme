VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT  ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
DATE    ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS  = -s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.date=$(DATE)

.PHONY: build install clean test lint snapshot

build:
	go build -trimpath -ldflags="$(LDFLAGS)" -o haiphen ./cmd/haiphen

install: build
	mv haiphen $(GOPATH)/bin/haiphen 2>/dev/null || mv haiphen /usr/local/bin/haiphen

clean:
	rm -f haiphen
	rm -rf dist/

test:
	go test ./...

lint:
	golangci-lint run ./...

snapshot:
	goreleaser release --snapshot --clean
