# קלוד קוד, האתר שלנו

צ׳אט עם Claude שרץ על Netlify, בלי סרגל הכלים של claude.ai.

- `public/index.html`: האתר (צ׳אטים, שינוי שם, מחיקה והדבקת תמונות). הצ׳אטים נשמרים בדפדפן של מי שמשתמש באתר.
- `netlify/functions/chat.mjs`: השרת שמדבר עם Claude דרך ה-API של Anthropic.

## איך מעלים

1. ב-Netlify: **Add new project → Import an existing project → GitHub**, ובוחרים את הריפו `kesef-hacham`.
2. **Base directory:** `claude-code-app`. שאר ההגדרות נקראות מ-`netlify.toml`.
3. ב-**Project configuration → Environment variables** מוסיפים:
   - `ANTHROPIC_API_KEY`: מפתח מ-https://console.anthropic.com
   - `APP_PASSWORD`: סיסמה לאתר. בלי סיסמה, כל מי שמגיע לכתובת יכול להשתמש במפתח שלך ולחייב אותו.
4. מפרסמים (Deploy). בכניסה הראשונה האתר יבקש את הסיסמה.

אי אפשר להעלות את התיקייה הזו בגרירה ל-Netlify Drop, כי Drop לא מריץ את השרת.

## חשוב לדעת

- כל הודעה עולה כסף לפי השימוש ב-API, והחיוב יורד מהחשבון של מפתח ה-API.
- Claude באתר הזה הוא לא הסשן של Claude Code: אין לו גישה לריפו, לקבצים או למחשבים. הוא רק עונה בצ׳אט.
