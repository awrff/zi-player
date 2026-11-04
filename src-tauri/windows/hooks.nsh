!macro NSIS_HOOK_POSTUNINSTALL
  ; Preserve cached songs during automatic updates. On a real uninstall the
  ; default template has already checked that the app is no longer running.
  ${If} $UpdateMode <> 1
    SetShellVarContext current
    RMDir /r "$APPDATA\com.jayden.zi-player\audio"
    RMDir /r "$APPDATA\com.jayden.zi-player\covers"
  ${EndIf}
!macroend
