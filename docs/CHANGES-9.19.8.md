# 9.19.8: Premium page

Three small changes, all in `js/11-premium.js` (plus the version).

1. **The line under "Bajeti Yanga Premium" is back to "Unlock the full power of your money."** (English). It was reworded in 9.19.7. The Chichewa
   line never changed, so the two match again.
2. **New 8th tile on the Premium page: "Saved AI Chats"** (`message-circle` icon, already in the icon bundle). It is a real Premium feature already
   checked in the app: free accounts keep up to 3 saved AI chats, Premium has no limit. The tile list now has 8 tiles, so the two-column grid fills four even rows.
3. **The last tile is no longer stretched across the full width.** That rule only existed to fill the gap left by an odd number of tiles.

Not changed: the 6-feature lists in the "this is a Premium feature" window and the Premium status window (6 is already even), and everything from 9.19.7.

Undo: delete the `Saved AI Chats` line from `feats`, and put back `+(i===feats.length-1?';grid-column:1/-1':'')+` in the tile's style.

## Check on a phone after deploying

1. Open Profile > Premium (or tap a locked feature, then Upgrade): the line under "Bajeti Yanga Premium" reads "Unlock the full power of your money."
2. In the "Included" list there are 8 tiles in 4 even rows, ending with "Saved AI Chats". No tile is stretched.
3. In dark mode the new tile looks like the others.
