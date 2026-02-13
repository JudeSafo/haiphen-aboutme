package util

import (
	"fmt"
	"io"
	"strings"

	"github.com/haiphen/haiphen-cli/internal/tui"
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

type BannerSize string

const (
	BannerSizeWide    BannerSize = "wide"
	BannerSizeCompact BannerSize = "compact"
	BannerSizeRobot   BannerSize = "robot"
)

func PrintBanner(w io.Writer, size BannerSize) {
	if size == BannerSizeRobot {
		printRobotBanner(w)
		return
	}
	var s string
	switch size {
	case BannerSizeCompact:
		s = BannerCompact
	default:
		s = BannerWide
	}
	s = strings.Trim(s, "\n")
	_, _ = fmt.Fprintln(w, s)
}

// printRobotBanner renders the branded robot mark in blue with white H/phen.
// The geometry mirrors robot_haiphen.svg: rectangular head, two square eyes,
// horizontal mouth, L-shaped antenna, "i" letterform.
// Reads as H[robot=a][i]phen.
func printRobotBanner(w io.Writer) {
	blue := "\033[94m"   // bright blue for robot ai
	text := "\033[1;97m" // bold bright white for H/phen

	fmt.Fprintln(w, tui.C(blue, "      ━━━━━━━━━━━━━━━━━━━━━━┓"))
	fmt.Fprintln(w, tui.C(blue, "        ┏━━━━━━━━━━━━━━━━━━━┫  ●"))
	fmt.Fprintln(w, tui.C(blue, "        ┃   ■           ■   ┃  ┃"))
	fmt.Fprintf(w, "   %s    %s  %s\n",
		tui.C(text, "H"), tui.C(blue, "┃                   ┃  ┃"), tui.C(text, "phen"))
	fmt.Fprintln(w, tui.C(blue, "        ┃   ═════════════   ┃  ┃"))
	fmt.Fprintln(w, tui.C(blue, "        ┗━━━━━━━━━━━━━━━━━━━┻━━┛"))
}
