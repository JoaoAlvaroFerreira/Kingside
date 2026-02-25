The following is a plan for improvement on the current application. Implementation must follow the usual principles and also be accompanied by adding test to any of the relevant new features, with at least 90% code coverage. Only make a DETAILED PLAN from this file, so that Sonnet can later implement it. Think of any issues in the features mentioned or details you want to clarify, and ASK EVERYTHING before writing the plan (in another .md file).

New feature: Import master games using Lichess username. Allow user to input master name and game count when adding the games, instead of relying on the settings tab (as it should be a one time thing and not recurrent). lichess-api.json contains details about the Lichess API, so you should be able to find out how to call it to obtain the games with the right params.

Database:
- Clarification (answer in CMD): what is stored in SQLite, only the Repertoire?
- User games and master games, should also be stored in SQLite to not have to re-fetch them.
- User settings should also be stored in SQLite.


PGN parsing:
- PGN parsing should be expanded to also accept importing the evaluation from lichess. This evaluation is represented between brackets.
- There are some situations where PGN parsing fails due to claiming moves are null. Expand testing for PGN parsing with more, different examples of valid games.

UI improvement:
- Making the UI flexible for it to also look good on tablets or devices with different sizes
- UI should have less padding except at the borders and UI elements should "fill" the screen dynamically, without overlapping.


Repertoire study: 
- Chapter select is currently only a small list that you scroll through horizontally. This makes it unreadanble for chapters with long titles or repertoires with a lot of chapters. We should be prepared for long lists of chapters, so we want a long vertical scrollable list that can be minimized in the selection menu.
- Repertoires can be really big and having a full repertoire loaded in memory at once is taxing on the device. When creating testable variations and working through them, we should only keep a small number of them in memory (for example only 40-50) and then load more progressively as needed.
- Width-first selection is not working as intended. We should not have to repeat the first move for every variation - let's "test" the first move, then jump directly to the first move of every branch and its reply, then continue on the first branch in this process. Width-first needs more testing and clarification on behavior.


Game Review:
- Remove the "no engine analysis" mention in game review. Integrate the features of the current analysis board in game review, maintaining the "key move system" (maybe as a separate line on the dashboard).
- A full analysis of the game should be performed before the game review is shown. During this, moves should be classified as blunders, inaccuracies or mistakes depending on how they change the evaluation. There will be a small segment below explaining how to classify moves as blunders, mistakes or inaccuracies. You can just add the classification as an annotation, which is also typically done on PGNs.
- The full game analysis should generate a small graph component that displays evaluation fluctuation throughout the game.
- TABS IN GAME REVIEW: The above UI elements should be split into tabs below the board. One tab could be the graph, another the tabs for master games and "your games" in this position.
