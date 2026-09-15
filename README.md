<div align="center">

<img src="icons/icon128.png" width="96" height="96" alt="YT Farsi" />

# یوتیوب فارسی

**اسکیپ تبلیغ · زیرنویس فارسی · دوبله زنده Gemini**

افزونه‌ای برای کروم، ادج و فایرفاکس — Manifest V3 — نسخه **1.4.3**

<br />

<img alt="Version" src="https://img.shields.io/badge/version-1.4.3-22c55e?style=for-the-badge" />
<img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-4285F4?style=for-the-badge" />
<img alt="License" src="https://img.shields.io/badge/license-personal-6b7280?style=for-the-badge" />

<br />

<img alt="Chrome" src="https://img.shields.io/badge/Chrome-4285F4?style=flat-square&logo=googlechrome&logoColor=white" />
<img alt="Edge" src="https://img.shields.io/badge/Edge-0078D7?style=flat-square&logo=microsoftedge&logoColor=white" />
<img alt="Firefox" src="https://img.shields.io/badge/Firefox-FF7139?style=flat-square&logo=firefoxbrowser&logoColor=white" />
<img alt="YouTube" src="https://img.shields.io/badge/YouTube-FF0000?style=flat-square&logo=youtube&logoColor=white" />
<img alt="Gemini" src="https://img.shields.io/badge/Gemini-8E75B2?style=flat-square&logo=googlegemini&logoColor=white" />
<img alt="Google Translate" src="https://img.shields.io/badge/Google%20Translate-4285F4?style=flat-square&logo=googletranslate&logoColor=white" />

<br />

[دانلود زیپ آخرین ریلیز](https://github.com/khode-mwri/yt_ad-skip/releases/latest) ·
[همه ریلیزها](https://github.com/khode-mwri/yt_ad-skip/releases) ·
[کد main](https://github.com/khode-mwri/yt_ad-skip/archive/refs/heads/main.zip)

</div>

---

<div dir="rtl">

## چیست؟

بعد از باز کردن ویدیوی یوتیوب، افزونه دو کار می‌کند:

1. **تبلیغ** را اگر دکمه Skip داشت اتوماتیک رد می‌کند. اگر تبلیغ غیرقابل‌اسکیپ باشد، بی‌صدا و با سرعت تا ۱۶برابر رد می‌شود.
2. **زیرنویس فارسی** را روی خود ویدیو نشان می‌دهد. اگر ویدیو ترک زیرنویس داشته باشد، همه خط‌ها از پیش دانلود و همگام با پخش نمایش داده می‌شوند.
3. **دوبله زنده** (اختیاری) صدای تب را با مدل `gemini-3.5-live-translate-preview` به فارسی ترجمه و پخش می‌کند.

این افزونه بلاکر تبلیغ نیست. تبلیغ همچنان لود می‌شود؛ فقط سریع‌تر یا با دکمه Skip رد می‌شود.

## قابلیت‌ها

### تبلیغات

| وضعیت | رفتار افزونه |
|---|---|
| تبلیغ قابل‌اسکیپ (دکمه Skip بعد از چند ثانیه) | همین دکمه را می‌زند. اگر کلیک رد شد، به انتهای تبلیغ هم پرش می‌کند |
| تبلیغ غیرقابل‌اسکیپ / Bumper | بی‌صدا + سرعت تا ۱۶× |
| بنر / اورلی روی ویدیو | دکمه بستن را می‌زند |
| پاپ‌آپ YouTube Premium | با «No thanks / بستن» بسته می‌شود. روی خود تبلیغ پریمیوم کلیک نمی‌کند |
| بعد از تبلیغ | سرعت و صدا به حالت قبل برمی‌گردد. اگر پلیر گیر کرد، **یک‌بار** Play می‌زند |

وقتی خودت ویدیو را Pause می‌کنی، افزونه دیگر به زور خودکار Play نمی‌کند (اصلاح ۱.۴.۳).

### زیرنویس فارسی

سه موتور در پاپ‌آپ قابل انتخاب است:

| موتور | مناسب برای | کلید API |
|---|---|---|
| **یوتیوب** (`tlang=fa`) | سریع‌ترین — کل ترک از پیش دانلود می‌شود | نمی‌خواهد |
| **Google Translate** | فال‌بک اگر ترک فارسی یوتیوب نخوانده شد | نمی‌خواهد |
| **Gemini 3.5 Flash-Lite** | ترجمه روان‌تر خط‌به‌خط | بله، در [AI Studio](https://aistudio.google.com/apikey) |

اگر ویدیو زیرنویس نداشته باشد، افزونه می‌گوید «CC را روشن کن» یا از دوبله زنده استفاده کن.

### دوبله زنده

- مدل: `gemini-3.5-live-translate-preview`
- فقط **کروم و ادج** (نیاز به `tabCapture` + `offscreen`)
- صدای تب گرفته می‌شود و ترجمه گفتاری فارسی پخش می‌شود
- معمولاً **۲ تا ۴ ثانیه** عقب از گوینده است (محدودیت خود مدل)
- هزینه API روی حساب Gemini تو است؛ برای ویدیوی طولانی رایگان نیست
- وسط تبلیغ استریم متوقف می‌شود

## نصب

### ۱) زیپ را بگیر

از ریلیز **v1.4.3**:

https://github.com/khode-mwri/yt_ad-skip/releases/download/v1.4.3/yt-farsi-helper-v1.4.3.zip

یا آخرین کد `main`:

https://github.com/khode-mwri/yt_ad-skip/archive/refs/heads/main.zip

زیپ را Extract کن. پوشه‌ای را انتخاب کن که **داخلش** `manifest.json` و پوشه `icons` هست — نه پوشه بالاتر.

### ۲) کروم یا ادج

1. برو روی `chrome://extensions` یا `edge://extensions`
2. **Developer mode** را روشن کن
3. **Load unpacked**
4. همان پوشه را انتخاب کن
5. تب یوتیوب را **کامل ببند و دوباره باز کن** (Refresh کافی نیست)

### ۳) فایرفاکس

1. برو روی `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on**
3. فایل `manifest.json` را انتخاب کن

دوبله زنده روی فایرفاکس فعال نیست. اسکیپ تبلیغ و زیرنویس متنی کار می‌کند.

## تنظیم Gemini

1. کلید را از [aistudio.google.com/apikey](https://aistudio.google.com/apikey) بگیر
2. روی آیکون افزونه بزن
3. کلید را در فیلد **Gemini API** بگذار
4. برای زیرنویس متنی: موتور را روی **Gemini Flash-Lite** بگذار
5. برای دوبله: تیک **دوبله زنده Gemini Live Translate** را بزن و اجازه ضبط صدای تب را تأیید کن

کلید فقط در `chrome.storage.local` مرورگر خودت می‌ماند. داخل ریپو نیست و هرگز commit نمی‌شود.

## ساختار پروژه

```
yt_ad-skip/
├── manifest.json          نسخه، مجوزها، content scripts
├── skip-ads.js            تشخیص دکمه Skip + پرش تبلیغ
├── content.js             تند/بی‌صدا، زیرنویس، overlay
├── live-ui.js             نمایش متن دوبله زنده
├── background.js          ترجمه Gemini / Google + timedtext
├── offscreen.html/.js     گرفتن صدای تب و WebSocket Live Translate
├── popup.html/.js/.css    تنظیمات
├── content.css            سبک زیرنویس فارسی
├── icons/                 icon16 … icon128
└── .github/workflows/     ساخت زیپ ریلیز
```

## مجوزها

| مجوز | برای چه |
|---|---|
| `storage` | تنظیمات و کلید API |
| `tabs` | پیدا کردن تب یوتیوب برای دوبله |
| `tabCapture` | گرفتن صدای تب (فقط دوبله) |
| `offscreen` | پخش صدای ترجمه‌شده خارج از صفحه |

درخواست‌ها فقط به یوتیوب، Google Translate و Gemini می‌روند.

## راه‌حل مشکل

**مانیفست لود نمی‌شود**  
پوشه غلط را لود کرده‌ای. باید `manifest.json` هم‌سطح با `icons/` باشد.

**اسکیپ کار نمی‌کند**  
تبلیغ ۶ یا ۱۵ ثانیه‌ای غیرقابل‌اسکیپ دکمه ندارد؛ فقط تند می‌شود. تب یوتیوب را کامل ببند و باز کن.

**پاپ‌آپ پریمیوم اسپم می‌شود**  
در ۱.۴.۱ به بعد برطرف شد. اگر هنوز هست از ۱.۴.۳ استفاده کن.

**Pause خودش Play می‌شود**  
باگ ۱.۴.۱ بود؛ در ۱.۴.۳ حذف شد.

**زیرنویس نمی‌آید**  
CC را روشن کن. بعض ویدیوها ترک ندارند.

## تاریخچه کوتاه

| نسخه | تغییر |
|---|---|
| **1.4.3** | Pause کاربر دیگر با Play اجباری لغو نمی‌شود |
| **1.4.2** | تشخیص جدا دکمه Skip (آماده / شمارش / پریمیوم) |
| **1.4.1** | بستن بنر پریمیوم، پلی بعد از تبلیغ |
| **1.4.0** | دوبله زنده Gemini Live Translate |
| **1.3.x** | پیش‌دانلود زیرنویس با `tlang=fa` |

## حریم خصوصی

کلید Gemini از ریپو خارج می‌ماند. متن زیرنویس فقط برای ترجمه به یوتیوب / Google / Gemini فرستاده می‌شود. صدای دوبله فقط همان جلسه به Gemini می‌رود.

## توضیح

برای استفاده شخصی. قوانین و شرایط استفاده یوتیوب / Google را رعایت کن. یوتیوب ممکن است سلکتور یا رفتار تبلیغ را عوض کند.

</div>

---

<details>
<summary><strong>English summary</strong></summary>

Browser extension (Chrome / Edge / Firefox, Manifest V3) that:

- Clicks YouTube **Skip** when the button is actually ready (not the countdown, not the Premium upsell)
- Mutes and speeds unskippable ads up to 16×
- Prefetches captions and shows Persian overlay (`tlang=fa`, Google Translate, or Gemini 3.5 Flash-Lite)
- Optional **Gemini Live Translate** dubbing on Chrome/Edge only

Latest zip: [v1.4.3](https://github.com/khode-mwri/yt_ad-skip/releases/tag/v1.4.3)

Load unpacked from the folder that contains `manifest.json`. Close and reopen the YouTube tab after install. API keys stay in `chrome.storage.local`.

</details>
