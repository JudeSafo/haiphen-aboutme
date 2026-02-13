# VHS Tape: Usecase 03 — Gaps Identified (narrated story-mode)
# 720×480 @ 18px — 5-screen flow: greet → intro → command → recap → farewell

Output "docs/assets/demos/usecases/uc03-requirements.gif"

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
Type "haiphen brief uc03-intro"
Enter
Sleep 200ms
Show
Sleep 3.5s

# ── Screen 3: Live command ──
Hide
Type "clear"
Enter
Sleep 100ms
Show
Type "haiphen prospect investigation --id inv_3f2a1b"
Enter
Sleep 3.5s

# ── Screen 4: Recap narration ──
Hide
Type "clear"
Enter
Sleep 100ms
Type "haiphen brief uc03-recap"
Enter
Sleep 200ms
Show
Sleep 3.5s

# ── Screen 5: Farewell ──
Hide
Type "clear"
Enter
Sleep 100ms
Type "haiphen farewell"
Enter
Sleep 200ms
Show
Sleep 3s
