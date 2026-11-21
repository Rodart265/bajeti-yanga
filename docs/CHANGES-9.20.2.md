# 9.20.2 - trust and wording fixes (batch 1 of the UI/UX plan)

Small changes only. No look-and-feel changes: the glass, gradients and icons are untouched.

- **Same spent figure everywhere.** History and Insights now show exact amounts (for example MK 61,500) instead of
  rounding to "MK 62K". Amounts of a million or more are still shortened. The six-month chart bar on Home keeps its
  short label because the bars are narrow.
- **Warning triangle explained.** An entry whose name is only a category word (Transport, Food, Other...) now shows a
  visible "Add a name" label next to the triangle, on Home and in History. Before, the explanation was a hover
  tooltip that does not show on a phone. The Chichewa label "Onjezani dzina" needs a native check.
- **Chichewa ring on Home.** The words under the percentage no longer spill out of the ring. The words stay in the
  screen-reader label.
- **No double hyphens.** Six settings descriptions that read "text -- text" now read "text - text".

How to check on a phone after the refresh bar appears:
1. Home with a Transport entry: the row shows the triangle and "Add a name".
2. Home in Chichewa: the ring shows only the percentage.
3. Insights > History and Summary: Spent shows MK 61,500 style amounts, not "62K".
4. Profile: the download and delete descriptions have a single spaced hyphen.
