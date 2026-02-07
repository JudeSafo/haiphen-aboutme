# VHS Tape: Haiphen Knowledge Graph

Output "docs/assets/demos/cli-graph.gif"

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

Type "# Query knowledge graph for semiconductor suppliers"
Enter
Sleep 500ms

Type `haiphen graph query --q "supplier risk for semiconductors" --depth 2`
Enter
Sleep 2.5s

Type "# 3 entities found across 7 edges"
Enter
Sleep 3s
