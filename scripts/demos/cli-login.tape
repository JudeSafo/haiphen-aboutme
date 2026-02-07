# VHS Tape: Haiphen CLI Login
# Records: haiphen login -> status -> services

Output "docs/assets/demos/cli-login.gif"

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

Type "# Authenticate with Haiphen via GitHub OAuth"
Enter
Sleep 500ms

Type "haiphen login"
Enter
Sleep 1.5s

Type "# Check authentication status"
Enter
Sleep 300ms

Type "haiphen status"
Enter
Sleep 1.5s

Type "# Check all service health"
Enter
Sleep 300ms

Type "haiphen services"
Enter
Sleep 3s
