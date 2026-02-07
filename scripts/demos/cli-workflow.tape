# VHS Tape: Haiphen Full Workflow

Output "docs/assets/demos/cli-workflow.gif"

Set Shell "bash"
Set FontSize 13
Set Width 960
Set Height 600
Set Theme "Dracula"
Set Padding 20
Set TypingSpeed 45ms

Hide
Type `export PATH="DEMO_DIR:$PATH" PS1='$ '`
Enter
Sleep 300ms
Type "clear"
Enter
Sleep 300ms
Show

Type "# Haiphen CLI — Edge Protocol Intelligence"
Enter
Sleep 600ms

Type "haiphen login"
Enter
Sleep 1.2s

Type "haiphen status"
Enter
Sleep 1.2s

Type "# Scan edge gateway for vulnerabilities"
Enter
Sleep 300ms

Type "haiphen secure scan --target edge-gw-prod --type vulnerability"
Enter
Sleep 1.8s

Type "# Trace Modbus traffic"
Enter
Sleep 300ms

Type "haiphen network trace --target plc-gateway-01 --protocol modbus"
Enter
Sleep 1.8s

Type "# Query knowledge graph"
Enter
Sleep 300ms

Type `haiphen graph query --q "semiconductor suppliers" --depth 2`
Enter
Sleep 1.8s

Type "# All services operational. Edge intelligence delivered."
Enter
Sleep 3s
