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

function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function processTranslatedText(text) {
    if (!text) return "";
    return text.split(/([,;:!?.\n]+)/).map(part => {
        if (/^[,;:!?.\n]+$/.test(part)) return part + " ";
        return part.replace(/\s+/g, '');
    }).join('').trim();
}

function getScaledRate() {
    return ((parseInt(frequencySlider.value, 10) || 0) / 100) * 0.20;
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

function cleanString(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/[\u00A0\s]+/g, ' ').trim();
}

function getLemmaForm(word) {
    if (!word) return '';
    const cleanWord = cleanString(word);

    if (typeof nlp === 'function') {
        try {
            const doc = nlp(cleanWord);
            if (typeof doc.compute === 'function') {
                doc.compute('root');
                const json = doc.json();
                if (json[0]?.terms[0]?.root) {
                    return cleanString(json[0].terms[0].root);
                }
            }
            doc.verbs().toInfinitive();
            doc.nouns().toSingular();
            const transformed = cleanString(doc.text());
            if (transformed && transformed !== cleanWord) return transformed;
        } catch (e) { }
    }

    if (cleanWord.endsWith('ing')) {
        const stem = cleanWord.slice(0, -3);
        if (stem.length > 2) {
            if (stem.length > 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
                return stem.slice(0, -1);
            }
            return stem;
        }
    }
    if (cleanWord.endsWith('ed')) return cleanWord.slice(0, -2);
    if (cleanWord.endsWith('es')) return cleanWord.slice(0, -2);
    if (cleanWord.endsWith('s') && !cleanWord.endsWith('ss')) return cleanWord.slice(0, -1);

    return cleanWord;
}

function findDictMatches(tokenObj, dict) {
    if (!dict) return null;

    const raw = cleanString(tokenObj.original);
    const base = cleanString(tokenObj.base);
    const lemma = getLemmaForm(raw);

    const targetKeys = Array.from(new Set([
        raw,
        base,
        lemma,
        raw.endsWith('ing') ? raw.slice(0, -3) : null,
        raw.endsWith('ing') ? raw.slice(0, -3) + 'e' : null,
        raw.endsWith('ed') ? raw.slice(0, -2) : null,
        raw.endsWith('ed') ? raw.slice(0, -2) + 'e' : null,
        raw.endsWith('s') ? raw.slice(0, -1) : null
    ].filter(Boolean)));

    if (!Array.isArray(dict)) {
        for (const key of targetKeys) {
            if (dict[key]) return dict[key];
        }
        return null;
    }

    const matchedEntries = dict.filter(item => {
        const entryKey = cleanString(item.e || item.w || item.word || item.key);
        return targetKeys.includes(entryKey);
    });

    return matchedEntries.length > 0 ? matchedEntries : null;
}

function initializeTextLookup() {
    chrome.storage.local.get(['pendingLookup', 'swapRate'], (data) => {
        const savedRate = data.swapRate ?? 0.05;
        
        frequencySlider.value = getSliderValueFromRate(savedRate);
        rateVal.innerText = `${Math.round(savedRate * 100)}%`;
        setDirectionMode();

        if (data.pendingLookup) {
            handleIncomingText(data.pendingLookup);
            chrome.storage.local.remove(['pendingLookup']);
            return;
        }

        chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
            if (!activeTab?.id || activeTab.url?.startsWith('chrome://') || activeTab.url?.startsWith('about:')) return;

            chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                func: getSelectionText
            }, (results) => {
                const selectedText = results?.[0]?.result?.trim();
                if (selectedText) handleIncomingText(selectedText);
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

async function request_translate(query) {
    const response = await fetch("http://127.0.0.1:5000/translate", {
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

    return await response.json();
}

function analyzeTextWithNLP(text) {
    if (typeof nlp !== 'function') {
        return text.split(/([^\w\u0E00-\u0E7F]+)/).map(token => ({
            original: token,
            base: getLemmaForm(token),
            tag: null,
            isPunctuation: !token.trim().match(/[\w\u0E00-\u0E7F]/)
        }));
    }

    const doc = nlp(text);
    if (typeof doc.compute === 'function') {
        doc.compute('root');
    }

    const jsonOutput = doc.json();
    if (!jsonOutput?.length) return [];

    const processedTokens = [];

    jsonOutput.forEach(sentence => {
        sentence.terms.forEach(term => {
            if (term.pre) {
                processedTokens.push({ original: term.pre, base: term.pre, tag: null, isPunctuation: true });
            }

            let primaryTag = "UNK";
            if (term.tags.includes('Verb')) primaryTag = "V";
            else if (term.tags.includes('Noun')) primaryTag = "N";
            else if (term.tags.includes('Adjective')) primaryTag = "ADJ";
            else if (term.tags.includes('Adverb')) primaryTag = "ADV";
            else if (term.tags.includes('Pronoun')) primaryTag = "PRON";
            else if (term.tags.includes('Preposition')) primaryTag = "PREP";
            else if (term.tags.includes('Conjunction')) primaryTag = "CONJ";

            const computedBase = term.root || term.normal || term.clean || getLemmaForm(term.text);

            processedTokens.push({
                original: term.text,
                base: cleanString(computedBase),
                tag: primaryTag,
                fullTags: term.tags,
                isPunctuation: false
            });

            if (term.post) {
                processedTokens.push({ original: term.post, base: term.post, tag: null, isPunctuation: true });
            }
        });
    });

    return processedTokens;
}

function updateQuickLookup(text) {
    const dict = getActiveDictionary();
    const wordTokens = analyzeTextWithNLP(text).filter(t => !t.isPunctuation && t.base.length > 0);

    if (wordTokens.length) {
        renderQuickLookup(wordTokens[wordTokens.length - 1], dict);
    } else {
        lookupResults.innerHTML = `<span style="color:#666; font-style:italic;">No definitive translation dictionary index found.</span>`;
    }
}

function renderQuickLookup(tokenObj, dict) {
    const { original, tag, fullTags } = tokenObj;
    const matches = findDictMatches(tokenObj, dict);
    const baseWord = getLemmaForm(original);

    if (!matches) {
        lookupResults.innerHTML = `
            <div class="dict-entry">
                <span class="dict-word">${escapeHTML(original)}</span> 
                <span style="color:#888; font-size:0.8em;">(${tag || 'UNK'}) ➔ No local dictionary match found.</span>
            </div>
        `;
        return;
    }

    const sortedMatches = [...matches].sort((a, b) => {
        const aMatches = (a.c === tag || (tag === 'V' && (a.c === 'VI' || a.c === 'VT' || a.c === 'V')));
        const bMatches = (b.c === tag || (tag === 'V' && (b.c === 'VI' || b.c === 'VT' || b.c === 'V')));
        return bMatches - aMatches;
    });

    const displayTags = fullTags ? fullTags.slice(0, 2).join(', ') : (tag || 'UNK');

    const entryMarkup = sortedMatches.map((match, idx) => {
        const isPosMatch = (match.c === tag || (tag === 'V' && (match.c === 'VI' || match.c === 'VT' || match.c === 'V')));
        const posStyle = isPosMatch ? 'color: #4CAF50; font-weight: bold;' : '';
        const contextLine = match.r ? `<br/><span class="dict-details">Context: ${escapeHTML(match.r)}</span>` : '';
        const divider = idx < sortedMatches.length - 1 ? '<hr style="border:0; border-top:1px solid #2d2d2d; margin:6px 0;">' : '';

        return `
            <span class="dict-trans">${escapeHTML(match.t)}</span> 
            <span class="dict-details" style="${posStyle}">(${escapeHTML(match.c || 'POS')})</span>
            ${contextLine}
            ${divider}
        `;
    }).join('');

    lookupResults.innerHTML = `
        <div class="dict-entry">
            <span class="dict-word">${escapeHTML(original)}</span> 
            <span style="color:#aaa; font-size:0.85em; margin-right:8px;">➔ ${escapeHTML(baseWord)} [${escapeHTML(displayTags)}]</span>
            <br/><br/>
            ${entryMarkup}
        </div>
    `;
}

function crudeWordForWordTranslation(text) {
    const dict = getActiveDictionary();
    const translatedArray = analyzeTextWithNLP(text).map(tokenObj => {
        if (tokenObj.isPunctuation) return tokenObj.original;

        const matches = findDictMatches(tokenObj, dict);
        if (matches) {
            const bestMatch = matches.find(m =>
                m.c === tokenObj.tag || (tokenObj.tag === 'V' && (m.c === 'VI' || m.c === 'VT' || m.c === 'V'))
            );
            return bestMatch ? bestMatch.t : matches[0].t;
        }

        return tokenObj.original;
    });

    return `<div style="background-color: #3d2b00; border: 1px dashed #ffb700; color: #ffe699; padding: 0 6px; border-radius: 6px; font-size: 0.9em; margin-bottom: 6px;">
        ⚠️ <strong>Offline Word-for-Word Translation</strong> (API Unreachable)
    </div>${escapeHTML(translatedArray.join(''))}`;
}

function processAndTranslateText() {
    const text = txtInput.value;
    rawInputText = text;

    if (translateTimer) clearTimeout(translateTimer);

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
                divOutput.innerText = processTranslatedText(rawResult) || "Translation complete.";
            })
            .catch(() => {
                divOutput.innerHTML = crudeWordForWordTranslation(rawInputText);
            });
    }, 2000);
}

function setDirectionMode() {
    modeDisplay.innerText = "ENG ➔ THAI";
    modeDisplay.style.background = "#1a2333";
    modeDisplay.style.color = "#3894ff";
    modeDisplay.style.borderColor = "#223a5e";
}

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

frequencySlider.addEventListener('input', () => {
    const rate = getScaledRate();
    rateVal.innerText = `${Math.round(rate * 100)}%`;
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
        chrome.tabs.sendMessage(activeTab.id, { action: "REVERT_PAGE" }, () => chrome.runtime.lastError);
    });
});

btnTransformPage.addEventListener('click', () => {
    const rate = getScaledRate();

    chrome.storage.local.set({ autoTransform: true, swapRate: rate, currentMode });

    chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
        if (!activeTab?.id) return;
        chrome.tabs.sendMessage(activeTab.id, {
            action: "TRANSFORM_PAGE",
            rate,
            mode: currentMode,
            configBlob: generateConfigObject()
        }, () => chrome.runtime.lastError);
    });
});

document.addEventListener('DOMContentLoaded', initializeTextLookup);