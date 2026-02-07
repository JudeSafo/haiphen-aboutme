# VHS Tape: Haiphen Risk Assessment

Output "docs/assets/demos/cli-risk.gif"

Set Shell "bash"
Set FontSize 14
Set Width 900
Set Height 500
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

Type "# Run portfolio risk assessment under stress scenario"
Enter
Sleep 500ms

Type `haiphen risk assess --scenario "rate_hike_300bp"`
Enter
Sleep 2.5s

Type "# VaR 95%: -4.23%, CVaR: -5.91% over 30-day horizon"
Enter
Sleep 3s
