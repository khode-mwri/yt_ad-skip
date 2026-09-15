# یوتیوب فارسی — اسکیپ تبلیغ + مترجم

افزونه Manifest V3 برای Chrome / Edge / Firefox.

ریپو: https://github.com/khode-mwri/yt_ad-skip

## دانلود زیپ
- ریلیزها: https://github.com/khode-mwri/yt_ad-skip/releases
- آخرین کد به صورت زیپ: https://github.com/khode-mwri/yt_ad-skip/archive/refs/heads/main.zip

## قابلیت‌ها
- اسکیپ خودکار دکمه Skip یوتیوب
- بی‌صدا و تند کردن تبلیغ غیرقابل‌اسکیپ (فقط وقتی پلیر کلاس `ad-showing` دارد)
- ترجمه زیرنویس به فارسی با **Gemini 3.5 Flash-Lite**
- اگر کلید Gemini نباشد، از Google Translate استفاده می‌شود

## نصب
1. زیپ را دانلود و Extract کن
2. `chrome://extensions` → Developer mode → Load unpacked
3. پوشه‌ای را انتخاب کن که `manifest.json` داخلش است
4. تب یوتیوب را رفرش کن

## کلید Gemini
1. از [Google AI Studio](https://aistudio.google.com/apikey) یک API key بگیر
2. روی آیکون افزونه بزن
3. موتور را روی Gemini 3.5 Flash-Lite بگذار
4. کلید را در فیلد مربوطه بگذار

کلید فقط در `chrome.storage.local` مرورگر ذخیره می‌شود و داخل ریپو نیست.

مدل: `gemini-3.5-flash-lite`
