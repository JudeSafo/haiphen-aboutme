package util

import (
	"fmt"
	"io"
	"strings"
)

const BannerWide = `
  ...        ..                                   :%#.
  #%*       -%%:                                  :@%.
  #@*       -@@:                                  :@%.
  #@#:::::::+@@:  ........::   :..:  :+=.=***=:   :@%-=**+-     -++*+=:   .++:=+*+-
  #@%#######%@@: ..........::  ....  =@@#+--+%%+  :@%*-:=%@=  :%%=::-*@*  :@@*-:-%@+
  #@*       -@@: :. .    .  -   ...  =@%.    :%@- :@%.   *@*  #@#++++*%%- .@@:   +@#
  #@*       -@@: :. .    .  -  :..:  =@%:    -@@: :@%.   *@*  #@#:...:--. .@@:   +@#
  #@*       -@@: ::..:::::. :  :. :  =@%#*++#@#-  :@@.   *@*  .*%#+=+#%+  :@@:   +@#
  :-:       .--            ..  :. :  =@# :==-:     --    :-:    .-==-:.    --    .-:
                               :. :  =@%
                               .:::  -*+
`

const BannerCompact = `
 _   _       _       _
| | | | __ _(_)_ __ | |__   ___ _ __
| |_| |/ _` + "`" + ` | | '_ \| '_ \ / _ \ '_ \
|  _  | (_| | | |_) | | | |  __/ | | |
|_| |_|\__,_|_| .__/|_| |_|\___|_| |_|
              |_|
`

const BannerRobot = `
        ┌───────────┐
        │  ◉     ◉  │
        │     ▽     │
        │  ╰─────╯  │
        └─────┬─────┘
          ┌───┴───┐
          │ ░░░░░ │
          │ ░ H ░ │
          │ ░░░░░ │
          └───┬───┘
            ┌─┴─┐
           ─┘   └─
`

type BannerSize string

const (
	BannerSizeWide    BannerSize = "wide"
	BannerSizeCompact BannerSize = "compact"
	BannerSizeRobot   BannerSize = "robot"
)

func PrintBanner(w io.Writer, size BannerSize) {
	var s string
	switch size {
	case BannerSizeCompact:
		s = BannerCompact
	case BannerSizeRobot:
		s = BannerRobot
	default:
		s = BannerWide
	}
	s = strings.Trim(s, "\n")
	_, _ = fmt.Fprintln(w, s)
}
