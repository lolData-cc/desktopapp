; The installer claims loldata:// as well as the app.
;
; The app registers the scheme itself on first run, but only once it HAS run —
; so a link clicked before that would silently do nothing, which is the failure
; mode this feature can least afford. Declaring it here means the very first
; "import runes" works.
;
; HKCU, matching what the app writes: a per-user association needs no elevation.
!macro customInstall
  WriteRegStr HKCU "Software\Classes\loldata" "" "URL:lolData Protocol"
  WriteRegStr HKCU "Software\Classes\loldata" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\loldata\DefaultIcon" "" "$INSTDIR\lolData.exe,0"
  WriteRegStr HKCU "Software\Classes\loldata\shell\open\command" "" '"$INSTDIR\lolData.exe" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\loldata"
!macroend
