The following is a plan for improvement on the current application. Implementation must follow the usual principles and also be accompanied by adding test to any of the relevant new features, with at least 90% code coverage. Only make a DETAILED PLAN from this file, so that Sonnet can later implement it. Think of any issues in the features mentioned or details you want to clarify, and ASK EVERYTHING before writing the plan (in another .md file).

* When creating trainable variations out of a repertoire, only generate branches from diverging opponent moves, not from our own (using repertoire color as reference). We want all of those moves in the repertoire still in the PGN for analysis and to check alternate possible moves, but the trainable variations should only be generated from the move in the branch with the most priority. This is hard to define concretely because some PGNs might have the variation "priority" wrong, so keep this option as a checkbox that can be enabled or disabled (what would be more approriate, on Import or on Training Screen?)


* For chessable import repertoires, add an option where trainable variations are imported directly - meaning, each chapter is a variation directly and that's it, no creating of sub-variations. Keep the old mode as a more "complete" option, this should be a checkbox. Just like the last task - is it better to add this on Import or on the Training Screen?

* During training variations, auto-scroll the variations list so that we can keep track of what variation we're on. Maybe also highlight the current variation on the list with a lighter color.

* Opponent moves often have annotations that are auto-skipped in variation training learning mode, to jump to the user input. We should save that annotation (if it exists) and display it during the user's move (if annotation display is enabled such as in learning mode of course, otherwise no). If both half-moves have annotations,  then we should have two annotation boxes (with different colors to show that one refers to the opponent's move and the other to our own).

* Completing a variation shouldn't auto-skip to the next, only skip after user reviews difficulty or deletes variation.

* Add support for more complex notation elements as board representation and in the move history: move notations (??, !?, ∞, ±, =, so on) and move arrows that might be present in PGNs (example: an arrow from G1 to E3 is represented as { [%cal Gc1e3] }). Let's use different colors for engine arrows, user learn arrows and PGN arrows.