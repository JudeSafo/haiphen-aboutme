# VHS Tape: Haiphen Causal Analysis

Output "docs/assets/demos/cli-causal.gif"

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

Type "# Analyze causal chain from production incident"
Enter
Sleep 500ms

Type `haiphen causal analyze --events '[{"event":"firmware_update"},{"event":"modbus_timeout"},{"event":"plc_reset"},{"event":"production_halt"}]'`
Enter
Sleep 2.5s

Type "# Root cause: firmware_update_v2.3.1 (87% confidence)"
Enter
Sleep 3s
