# VHS Tape: Haiphen Security Scan

Output "docs/assets/demos/cli-secure.gif"

Set Shell "bash"
Set FontSize 14
Set Width 900
Set Height 520
Set Theme "Dracula"
Set Padding 20
Set TypingSpeed 50ms

Hide
Type `export PATH="DEMO_DIR:$PATH" PS1='$ '`
Enter
Sleep 300ms
Type "clear"
Enter
Sleep 300ms
Show

Type "# Edge security vulnerability scan"
Enter
Sleep 500ms

Type "haiphen secure scan --target edge-gw-prod --type vulnerability"
Enter
Sleep 2.5s

Type "# 3 findings detected — 1 high, 1 medium, 1 low"
Enter
Sleep 3s
