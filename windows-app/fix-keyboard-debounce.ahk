; =============================================================================
; fix-keyboard-debounce.ahk  —  Backspace de-chatter for a faulty keyboard
; =============================================================================
;
; PROBLEM
;   A worn/faulty keyboard "chatters": a single Backspace press registers as
;   several rapid-fire presses, randomly deleting more than you intended.
;
; WHAT THIS DOES
;   It debounces the Backspace key. Whenever a Backspace key-DOWN arrives within
;   DEBOUNCE_MS of the previous accepted Backspace, it is swallowed (ignored).
;   Presses spaced further apart pass through normally, so deliberate typing and
;   holding Backspace to auto-repeat still work as expected. Only the spurious
;   machine-gun double/triple fires get filtered out.
;
; HOW TO USE
;   1. Install AutoHotkey v2  ->  https://www.autohotkey.com/  (v2, NOT v1).
;   2. Double-click this file to run it (a green "H" appears in the tray).
;   3. To auto-start at login, drop a shortcut to this file in your Startup
;      folder:  press Win+R, type  shell:startup , Enter, paste the shortcut.
;   4. Tune DEBOUNCE_MS below if needed:
;        - Still getting double-deletes?  Raise it (e.g. 70).
;        - Fast intentional presses feel blocked?  Lower it (e.g. 35).
;      ~50ms is a good starting point: faster than any human double-tap, but
;      long enough to absorb hardware chatter.
;
; To stop it: right-click the tray icon -> Exit.
; =============================================================================

#Requires AutoHotkey v2.0
#SingleInstance Force

; --- Configuration -----------------------------------------------------------
DEBOUNCE_MS := 50          ; swallow Backspace presses closer together than this

; --- State -------------------------------------------------------------------
global lastBackspace := 0  ; tick count (ms) of the last ACCEPTED Backspace

; --- Hotkey ------------------------------------------------------------------
; "*" allows modifiers (Ctrl/Shift/Alt + Backspace) through the same filter.
; "$" forces the keyboard hook so our own Send isn't re-caught (no loop).
*$Backspace::
{
    global lastBackspace, DEBOUNCE_MS
    now := A_TickCount
    if (now - lastBackspace < DEBOUNCE_MS)
        return                 ; too soon after the last one -> chatter, swallow it
    lastBackspace := now
    Send("{Backspace}")        ; legitimate press -> let it through
}
