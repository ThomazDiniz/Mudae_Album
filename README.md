## Mudae Album

Generate a “sticker album” from your `mudae.txt` (`Name - URL` format) using **pure HTML + CSS + JS**, and download all images.

### Requirements

- A modern browser (recommended: Chromium-based)
- Internet access while downloading images

### Usage

Open `index.html` in your browser, then:

- Click **“Paste text”** and paste your list (`Name - URL`)
- Click **“Export album (ZIP)”** to download a `.zip` containing `index.html` + `images/` (shareable)

### Language

Use the **EN / PT-BR** selector in the top-right corner. The choice is saved in `localStorage`.

### Notes

- `mudae.net/uploads/...` URLs are already direct image links.
- `imgur.com/<id>` page links are resolved to the real image using `og:image`.
- This project is intentionally “no build step” and “no server”.

