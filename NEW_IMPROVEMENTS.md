The following is a plan for improvement on the current application. Implementation must follow the usual principles and also be accompanied by adding test to any of the relevant new features, with at least 90% code coverage. Only make a DETAILED PLAN from this file, so that Sonnet can later implement it. Think of any issues in the features mentioned or details you want to clarify, and ASK EVERYTHING before writing the plan (in another .md file).


* Orientation lock by default to portrait mode, follow the device's configuration when possible.

* Master game imports are not including their annotations, and this should happen both on repertoire imports (chessable option) and when directly imported.

* Move history and the chessboard should take up the full width of the screen, currently it has a lot of padding around the border

* Annotations are cut off at the bottom even when scrolled to the max. Maybe add some era height to the scrollable part of the annotation?

* Remove the component that shows the "check!", "game over" messages, they are not needed (in any of the screens)

* Don't start master games at the last move, start them at the first.

* Default to XL in board settings, as mentioned above, which should hug the sides of the screen on phones.

* Hide (comment out) board settings in the variation training screen

* Annotations on move 0 are a possibility and they're not being shown or imported.

* Changing tabs to/away from the analysis board should reset the engine and the PGN being analysed to just the starting position.