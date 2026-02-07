# VHS Tape: Haiphen Network Trace

Output "docs/assets/demos/cli-network.gif"

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

Type "# Trace Modbus traffic on PLC gateway"
Enter
Sleep 500ms

Type "haiphen network trace --target plc-gateway-01 --protocol modbus"
Enter
Sleep 2.5s

Type "# 1247 packets captured, 2 anomalies detected"
Enter
Sleep 3s
