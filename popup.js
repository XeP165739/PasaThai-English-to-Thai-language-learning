let currentMode = 'ENG_TO_THAI';
let rawInputText = '';
let translateTimer = null;

const txtInput = document.getElementById('txtInput');
const divOutput = document.getElementById('divOutput');
const frequencySlider = document.getElementById('frequencySlider');
const rateVal = document.getElementById('rateVal');
const btnRevert = document.getElementById('btnRevert');
const btnTransformPage = document.getElementById('btnTransformPage');
const modeDisplay = document.getElementById('modeDisplay');
const lookupResults = document.getElementById('lookupResults');

chrome.runtime.connect({ name: "popup" });

function processTranslatedText(text) {
    if (!text) return "";
    const parts = text.split(/([,;:!?.\n]+)/);
    return parts.map(part => {
        if (/^[,;:!?.\n]+$/.test(part)) {
            return part + " ";
        }
        return part.replace(/\s+/g, '');
    }).join('').trim();
}

function getScaledRate() {
    const rawSliderValue = parseInt(frequencySlider.value, 10) || 0;
    return (rawSliderValue / 100) * 0.20;
}

function getSliderValueFromRate(rate) {
    return Math.round((rate / 0.20) * 100);
}

function getActiveDictionary() {
    return window.LEXITRON_ET || {};
}

function getSelectionText() {
    return window.getSelection().toString();
}

function initializeTextLookup() {
    chrome.storage.local.get(['pendingLookup', 'swapRate'], (data) => {
        const savedRate = data.swapRate !== undefined ? data.swapRate : 0.05;
        
        frequencySlider.value = getSliderValueFromRate(savedRate);
        rateVal.innerText = `${Math.round(savedRate * 100)}%`;
        setDirectionMode();

        if (data.pendingLookup) {
            handleIncomingText(data.pendingLookup);
            chrome.storage.local.remove(['pendingLookup']);
            return;
        }

        chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
            if (!activeTab?.id) return;

            if (activeTab.url?.startsWith('chrome://') || activeTab.url?.startsWith('about:')) {
                return;
            }

            chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                func: getSelectionText
            }, (results) => {
                const selectedText = results?.[0]?.result?.trim();
                if (selectedText) {
                    handleIncomingText(selectedText);
                }
            });
        });
    });
}

function handleIncomingText(text) {
    const cleanedText = text.replace(/\s+/g, ' ').trim();
    txtInput.value = cleanedText;
    rawInputText = cleanedText;
    processAndTranslateText();
}

async function request_translate(query){
    // live server to run libretranslate
    const libretranslate_HTTP = "http://127.0.0.1:5000/translate";

    try {
        if (query.length === 0) throw new Error("Nothing to translate");

        const response = await fetch(libretranslate_HTTP, {
            method: "POST",
            body: JSON.stringify({
                q: query,
                source: "en",
                target: "th",
                format: "text",
                alternatives: 0,
                api_key: ""
            }),
            headers: { "Content-Type": "application/json" }
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Translation failed:", error);
        throw error;
    }
}

function updateQuickLookup(text) {
    const dict = getActiveDictionary();
    let lastMatchedWord = "";
    const tokens = text.split(/(\s+|\b)/);

    for (const token of tokens) {
        const cleanKey = token.toLowerCase().trim();
        if (cleanKey && dict[cleanKey]) {
            lastMatchedWord = cleanKey;
        }
    }

    if (lastMatchedWord) {
        renderQuickLookup(lastMatchedWord);
    } else {
        lookupResults.innerHTML = `<span style="color:#666; font-style:italic;">No definitive translation dictionary index found.</span>`;
    }
}

function crudeWordForWordTranslation(text) {
    const dict = getActiveDictionary();
    const tokens = text.split(/(\s+|[^\w\u0E00-\u0E7F]+)/);

    const translatedArray = tokens.map(token => {
        const cleanKey = token.toLowerCase().trim();
        const match = dict[cleanKey]?.[0]?.t;
        return match || token;
    });

    const outputText = translatedArray.join('');

    return `<div style="background-color: #3d2b00; border: 1px dashed #ffb700; color: #ffe699; padding: 0 6px; border-radius: 6px; font-size: 0.9em; margin-bottom: 6px;">
        ⚠️ <strong>Offline Word-for-Word Translation</strong> (API Unreachable)
    </div>${outputText}`;
}

function processAndTranslateText() {
    const text = txtInput.value;
    rawInputText = text;

    if (translateTimer) {
        clearTimeout(translateTimer);
    }

    if (!text.trim()) {
        divOutput.innerText = "Processed tokens will render here...";
        lookupResults.innerHTML = `<span style="color:#666; font-style:italic;">No definitive translation dictionary index found.</span>`;
        return;
    }

    updateQuickLookup(text);

    divOutput.innerText = "Waiting for typing to finish...";
    
    translateTimer = setTimeout(() => {
        divOutput.innerText = "Translating...";
        
        request_translate(rawInputText)
            .then((data) => {
                const rawResult = data.translatedText || data.result || "";
                const processed = processTranslatedText(rawResult);
                
                divOutput.innerText = processed || "Translation complete.";
            })
            .catch((error) => {
                const fallbackOutput = crudeWordForWordTranslation(rawInputText);
                divOutput.innerHTML = fallbackOutput;
            });
    }, 2000);
}

function renderQuickLookup(word) {
    const dict = getActiveDictionary();
    const matches = dict[word];
    if (!matches) return;

    const entryMarkup = matches.map((match, idx) => {
        const contextLine = match.r ? `<br/><span class="dict-details">Context: ${match.r}</span>` : '';
        const divider = idx < matches.length - 1 ? '<hr style="border:0; border-top:1px solid #2d2d2d; margin:6px 0;">' : '';
        
        return `
            <span class="dict-trans">${match.t}</span> 
            <span class="dict-details">(${match.c || 'POS'})</span>
            ${contextLine}
            ${divider}
        `;
    }).join('');

    lookupResults.innerHTML = `
        <div class="dict-entry">
            <span class="dict-word">${word.toUpperCase()}</span> ➔ ${entryMarkup}
        </div>
    `;
}

function setDirectionMode() {
    modeDisplay.innerText = "ENG ➔ THAI";
    modeDisplay.style.background = "#1a2333";
    modeDisplay.style.color = "#3894ff";
    modeDisplay.style.borderColor = "#223a5e";
}

frequencySlider.addEventListener('input', () => {
    const rate = getScaledRate();
    const directPercentage = Math.round(rate * 100);
    rateVal.innerText = `${directPercentage}%`;
    
    chrome.storage.local.set({ swapRate: rate });
    processAndTranslateText();
});

txtInput.addEventListener('input', processAndTranslateText);

btnRevert.addEventListener('click', () => {
    if (translateTimer) clearTimeout(translateTimer);
    frequencySlider.value = 0;
    rateVal.innerText = "0%";
    chrome.storage.local.set({ swapRate: 0.0 });
    divOutput.innerText = rawInputText;

    chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
        if (!activeTab?.id) return;
        chrome.tabs.sendMessage(activeTab.id, {
            action: "REVERT_PAGE"
        });
    });
});

btnTransformPage.addEventListener('click', () => {
    const rate = getScaledRate();

    chrome.storage.local.set({
        autoTransform: true,
        swapRate: rate,
        currentMode: currentMode
    });

    chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
        if (!activeTab?.id) return;
        chrome.tabs.sendMessage(activeTab.id, {
            action: "TRANSFORM_PAGE",
            rate: rate,
            mode: currentMode,
            configBlob: generateConfigObject()
        });
    });
});

function generateConfigObject() {
    return {
        extensionMode: currentMode,
        translationProbability: getScaledRate(),
        uiSliderValue: parseInt(frequencySlider.value, 10) || 0,
        hasPendingInput: !!txtInput.value.trim(),
        inputLength: txtInput.value.length,
        timestamp: new Date().toISOString()
    };
}

function getSerializedConfigJson() {
    return JSON.stringify(generateConfigObject(), null, 2);
}

document.addEventListener('DOMContentLoaded', initializeTextLookup);