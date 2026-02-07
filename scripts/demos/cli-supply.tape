# VHS Tape: Haiphen Supply Chain

Output "docs/assets/demos/cli-supply.gif"

Set Shell "bash"
Set FontSize 14
Set Width 900
Set Height 540
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

Type "# Assess supplier risk profile"
Enter
Sleep 500ms

Type `haiphen supply assess --supplier "Acme Industrial"`
Enter
Sleep 2.5s

Type "# Overall risk: 0.42 — Recommendation: monitor"
Enter
Sleep 3s
