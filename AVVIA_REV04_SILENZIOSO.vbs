Option Explicit
Dim sh, fso, dir, bat
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
bat = dir & "\AVVIA_REV04.bat"
' 0 = finestra nascosta
sh.Run """" & bat & """", 0, False
