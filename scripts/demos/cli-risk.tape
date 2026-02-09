# VHS Tape: Haiphen Risk — portfolio stress test with metrics
# 740×360 @ 20px — single focused command

Output "docs/assets/demos/cli-risk.gif"

Set Shell "bash"
Set FontSize 18
Set Width 720
Set Height 400
Set Theme "Dracula"
Set Padding 12
Set TypingSpeed 40ms

Hide
Type `export PATH="DEMO_DIR:$PATH" PS1='$ '`
Enter
Sleep 300ms
Type "clear"
Enter
Sleep 300ms
Show

Type `haiphen risk assess --scenario "rate_hike_300bp"`
Enter
Sleep 2.5s

Sleep 3s
