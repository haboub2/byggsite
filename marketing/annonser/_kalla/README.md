# Källor för Binaafys annonser

- `build.js` – alla kampanjer och format (texter, bilder, layout). Ändra här, inte i HTML-filerna.
- `render.js` – gör PNG och PDF av HTML-filerna med Chrome.
- `copy.js` – skriver `../annonstexter.md` och kontrollerar Googles teckengränser.
- `sheet.js` – skriver `../oversikt.html` med alla annonser.
- `bilder/` – bilderna som används. `tak-*` är från egna jobb, `stock-*` är licensierade Unsplash-bilder.

```
npm i qrcode@1.5.4 --no-save
node build.js && node render.js && node sheet.js && node copy.js
```

`node build.js bygg-tak` och `node render.js bygg-tak` gör bara en kampanj.
