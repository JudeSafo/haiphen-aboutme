# VHS Tape: Haiphen Full Workflow — multi-command platform demo
# 780×400 @ 18px — login → scan → graph query

Output "docs/assets/demos/cli-workflow.gif"

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

Type "haiphen login"
Enter
Sleep 1.2s

Type "haiphen status"
Enter
Sleep 2s

Type "clear"
Enter
Sleep 300ms

Type "haiphen secure scan --target edge-gw-prod"
Enter
Sleep 2.5s

Type "clear"
Enter
Sleep 300ms

Type `haiphen graph query --q "semiconductors" --depth 2`
Enter
Sleep 3s
