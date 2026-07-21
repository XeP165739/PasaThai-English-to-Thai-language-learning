# PasaThai-English-to-Thai-language-learning

# PasaThai: Read & Learn Thai

**PasaThai** is a Chrome Extension designed for language learning through **diglot weave** (gradual immersion). While you browse the web, PasaThai dynamically swaps a percentage of English words on active webpages with their Thai equivalents using a local dictionary. It also provides instant selection tooltips and full-text translation support via a local machine translation server.

---

## Key Features

* **In-Context Page Transformation:** Replaces English words directly inside webpage text nodes based on a customizable probability swap rate (0%–20%).
* **Selection Tooltips:** Highlight any English word on a webpage to reveal a floating tooltip containing Thai translations, parts of speech, and contextual usage.
* **Context Menu Integration:** Right-click highlighted text to look up vocabulary immediately inside the extension popup.
* **Keyboard Shortcuts:**
  * `Ctrl+Shift+U` (Mac: `Cmd+Shift+U`): Open the extension popup.
  * `Ctrl+Shift+Y` (Mac: `Cmd+Shift+Y`): Trigger full-page transformation on the active tab.
* **Local Translation API Support:** Integrates with LibreTranslate for full-sentence translations when typed in the extension popup.
* **Offline Fallback:** If the translation API is unreachable, the extension falls back to an offline word-for-word translation mode using the local dictionary.

---

## Architecture & Project Structure

 ```Directory
 ├── manifest.json                  # Extension Manifest (V3)
 ├── background.js                  # Service worker handling commands, storage, and context menus
 ├── content.js                     # Content script handling DOM walking, text swap, and tooltips
 ├── content.css                    # Content script styles
 ├── popup.html                     # Extension popup interface
 ├── popup.js                       # Logic for popup interactions and translation requests
 ├── styles.css                     # Popup UI styles
 └── lexitron_2.0_csv/
 └── js/
 └── etlex-dictionary-data.js # Compiled LEXITRON English-Thai dictionary object
 ```


---

## Setup & Dependencies

To use PasaThai, two main assets/dependencies are required:

### 1. Dictionary Data (LEXITRON 2.0)
The offline word swapping and lookup features rely on the **LEXITRON** English-to-Thai dictionary dataset compiled into a JavaScript file (`etlex-dictionary-data.js`) attached to the `window.LEXITRON_ET` object.

> **Ensure the dictionary file exists at:**  
> `lexitron_2.0_csv/js/etlex-dictionary-data.js`

### 2. Local Translation Server (LibreTranslate)
For full-sentence processing in the popup, PasaThai sends requests to a local instance of [LibreTranslate](https://libretranslate.com/).

To save bandwidth, disk space, and startup time, configure LibreTranslate to download **only the English (`en`) and Thai (`th`) language models** rather than the full suite.

#### Installing & Running LibreTranslate:

**Via Python (pip):**
1. Install LibreTranslate:
   ```bash
   pip install libretranslate
   ```
   
2. Start the local server limiting downloaded language models to English and Thai only:

  ```Bash
  libretranslate --load-only en,th --port 5000
  Via Docker:
  ```

2. Run the Docker container restricting loaded languages to English and Thai:

  ```Bash
    docker run -p 5000:5000 libretranslate/libretranslate --load-only en,th
  ```
Ensure the server is listening at http://127.0.0.1:5000. If offline or unavailable, PasaThai automatically falls back to offline word-by-word substitution using LEXITRON.


Installation in Chrome
Clone or download this repository.

Ensure lexitron_2.0_csv/js/etlex-dictionary-data.js is present.

Open Chrome and navigate to chrome://extensions/.

Enable Developer mode using the toggle switch in the top-right corner.

Click Load unpacked and select the extension root directory.

---

## License & Acknowledgments

This project is licensed under the **MIT License**. However, it incorporates third-party data subject to separate licensing terms:

* **LEXITRON 2.0 Dictionary Data:** The dictionary dataset (`etlex-dictionary-data.js`) is copyrighted by the **National Electronics and Computer Technology Center (NECTEC)** and the **National Science and Technology Development Agency (NSTDA)**, Thailand. It is included under NECTEC's non-commercial research and educational licensing terms. The MIT license of this repository applies strictly to the extension source code, not to the dictionary dataset.
* **LibreTranslate:** PasaThai integrates with LibreTranslate, an open-source translation engine licensed under the **GNU AGPLv3**.

---
