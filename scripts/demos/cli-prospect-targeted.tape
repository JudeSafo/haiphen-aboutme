# VHS Tape: Haiphen Targeted Prospect Pipeline — Fortune 500 demo
# 720×480 @ 18px — greet → intro → targeted pipeline → report → recap → farewell
# Shows: targeted crawl → investigate → report generation for Goldman Sachs

Output "docs/assets/demos/cli-prospect-targeted.gif"

Set Shell "bash"
Set FontSize 18
Set Width 720
Set Height 480
Set Theme "Dracula"
Set Padding 12
Set TypingSpeed 40ms

# ── Setup (hidden) ──
Hide
Type `export PATH="DEMO_DIR:$PATH" PS1='$ '`
Enter
Sleep 300ms
Type "clear"
Enter
Sleep 300ms

# ── Screen 1: Greeting ──
Type "haiphen greet"
Enter
Sleep 200ms
Show
Sleep 2.5s

# ── Screen 2: Intro narration ──
Hide
Type "clear"
Enter
Sleep 100ms
Type "haiphen brief targeted-intro"
Enter
Sleep 200ms
Show
Sleep 3.5s

# ── Screen 3: Live targeted pipeline ──
Hide
Type "clear"
Enter
Sleep 100ms
Show
Type `haiphen prospect targeted-pipeline`
Enter
Sleep 8s

# ── Screen 4: Report generation ──
Hide
Type "clear"
Enter
Sleep 100ms
Show
Type `haiphen prospect report "Goldman Sachs"`
Enter
Sleep 4s

# ── Screen 5: Recap narration ──
Hide
Type "clear"
Enter
Sleep 100ms
Type "haiphen brief targeted-recap"
Enter
Sleep 200ms
Show
Sleep 4s

# ── Screen 6: Farewell ──
Hide
Type "clear"
Enter
Sleep 100ms
Type "haiphen farewell"
Enter
Sleep 200ms
Show
Sleep 3s
