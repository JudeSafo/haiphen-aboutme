# VHS Tape: Haiphen CLI Login
# Zoomed 640×360 @ 20px — auth flow: login → status → services

Output "docs/assets/demos/cli-login.gif"

Set Shell "bash"
Set FontSize 20
Set Width 640
Set Height 360
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
Sleep 1.5s

Type "haiphen status"
Enter
Sleep 2s

Type "clear"
Enter
Sleep 300ms

Type "haiphen services"
Enter
Sleep 3s
