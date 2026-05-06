# Remove the bad class string
sed -i 's/"panel-glass rounded-xl overflow-hidden shadow-xl shadow-black\/10",//g' src/App.tsx

# Only add it specifically to the global header where it belongs
sed -i 's/className={cn(\n              "pointer-events-none absolute z-30 flex items-start gap-2",/className={cn(\n              "panel-glass rounded-xl overflow-hidden shadow-xl shadow-black\/10",\n              "pointer-events-none absolute z-30 flex items-start gap-2",/g' src/App.tsx
