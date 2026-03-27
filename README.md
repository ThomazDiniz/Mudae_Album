## Mudae Album

Generate a “sticker album” from your `mudae.txt` (`Name - URL` format) using **pure HTML + CSS + JS**, and download all images.

### Live page

- [Open Mudae Album](https://thomazdiniz.github.io/Mudae_Album/)

### Usage

Open `index.html` in your browser, then:

- Click **“Paste text”** and paste your list (`Name - URL`)
- Click **“Export album (ZIP)”** to download a `.zip` containing `index.html` + `images/` (shareable)

### Input format (including `$mmis`)

This project expects **one sticker per line** in the format:

- `Name - URL`

If you use Mudae’s `$mmis`, you can typically **copy/paste the bot output** into the Import modal. The parser is tolerant of common Discord formatting like numbering and bullets, as long as each line contains a name and a URL.

Example lines you can paste:

- `Diane - https://mudae.net/uploads/3900740/iy1DIZM~QFuV9Ta.png`
- `1) Frieza - https://imgur.com/qwZS3EI.png`
- `• Popeye the Sailor — https://mudae.net/uploads/9727729/j9ZfugH~iaF2EDp.png`

### Language

Use the **EN / PT-BR** selector in the top-right corner. The choice is saved in `localStorage`.

### Notes

- `mudae.net/uploads/...` URLs are already direct image links.
- `imgur.com/<id>` page links are resolved to the real image using `og:image`.
- This project is intentionally “no build step” and “no server”.

