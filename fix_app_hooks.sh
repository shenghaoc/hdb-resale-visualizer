sed -i 's/selectedAddressKey, blocks.length/selectedAddressKey, blocks/g' src/App.tsx
sed -i 's/savedVisible, shortlist.items.length/savedVisible, shortlist.items, blocks/g' src/App.tsx
sed -i 's/isShortlistOpen, savedVisible, shortlist.items/isShortlistOpen, savedVisible, shortlist.items, shortlistDetails/g' src/App.tsx
sed -i 's/blocks.length,/blocks,/g' src/App.tsx
