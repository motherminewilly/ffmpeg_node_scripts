(async function () {
    const CONFIG = {
        GLOGAL_DELAY: 1000,
    }

    function waitMilliseconds(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds))
    }

    async function getElementByPlaceholder(tag, placeholderText, retries = 5, delay = CONFIG.GLOGAL_DELAY) {
        for (let i = 0; i < retries; i++) {
            const elements = document.querySelectorAll(tag);
            for (const el of elements) {
                const placeholder = el.getAttribute('placeholder') || '';
                if (placeholder.includes(placeholderText)) {
                    return el;
                }
            }

            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, delay));
            }
        }

        throw new Error(`Element with placeholder containing "${placeholderText}" not found after ${retries} retries.`);
    }

    async function getElementContainingText({ tag, text, retries = 5, delay = CONFIG.GLOGAL_DELAY, elementToQueryIn = document }) {
        for (let i = 0; i < retries; i++) {
            const elements = elementToQueryIn.querySelectorAll(tag);
            for (const el of elements) {
                // Only check elements where the text appears directly (not in children)
                const directText = Array.from(el.childNodes)
                    .filter(node => node.nodeType === Node.TEXT_NODE)
                    .map(node => node.textContent)
                    .join('').trim();

                if (directText.includes(text)) {
                    return el;
                }
            }

            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, delay));
            }
        }

        throw new Error(`Element with direct text "${text}" not found after ${retries} retries.`);
    }

    async function getElementByAriaLabelContains({
        text, retries = 5, delay = CONFIG.GLOGAL_DELAY, elementToQueryIn = document
    }) {
        for (let i = 0; i < retries; i++) {
            const el = elementToQueryIn.querySelector(`[aria-label*="${text}"]`);
            if (el) {
                return el;
            }
            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, delay));
            }
        }
        throw new Error(`Element with aria-label containing "${text}" not found after ${retries} retries.`);
    }

    function simulateTypingInCustomInput({ element, text, delay = 100 }) {
        return new Promise(resolve => {
            element.focus();
            element.textContent = ''; // clear it first

            let index = 0;

            function typeNextChar() {
                if (index < text.length) {
                    element.textContent += text[index];

                    // Dispatch input event
                    element.dispatchEvent(new InputEvent('input', { bubbles: true }));

                    // Optional keyboard events
                    const char = text[index];
                    element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                    element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

                    index++;
                    setTimeout(typeNextChar, delay);
                } else {
                    resolve(); // Done typing
                }
            }

            typeNextChar();
        });
    }

    /**
     * @param str Example of value: ghost recon wildlands 2025 06 17 21 13 35  PART 1 EDITED  PROCESSED  AUDIO VOICE2
     * We want to get the "VOICE2" in this case
     */
    function getTypeOfAudio(str) {
        const words = str.split(/[\s_\-]+/); // split by space, underscore, or hyphen
        let lastIndex = -1;

        // Find the last "AUDIO" (case-sensitive) index
        for (let i = 0; i < words.length; i++) {
            if (words[i] === "AUDIO") {
                lastIndex = i;
            }
        }

        if (lastIndex !== -1 && lastIndex < words.length - 1) {
            const result = words[lastIndex + 1];
            console.log("Word after AUDIO:", result);
            return result;
        } else {
            throw new Error('No valid word found after "AUDIO".');
        }
    }

    function normalizeFilename(filename) {
        return filename
            // 1. Remove file extension
            .replace(/\.[^/.]+$/, '')

            // 2. Replace "__" and "--" with two spaces
            .replace(/(__|--)/g, '  ')

            // 3. Replace remaining "_" and "-" with one space
            .replace(/[_-]/g, ' ')

            // 4. Collapse 3+ spaces into 2 (to preserve intentional double spacing)
            .replace(/ {3,}/g, '  ')

            // 5. Trim leading/trailing spaces
            .trim();
    }

    function incrementParteNumber(str) {
        const match = str.match(/(Parte\s+)(\d{1,4})/i);
        if (!match) {
            throw new Error(`No number found after "Parte" in: "${str}"`);
        }

        const prefix = match[1];         // e.g., "Parte "
        const currentNumber = match[2];  // e.g., "14"
        const nextNumber = String(Number(currentNumber) + 1);

        return str.replace(match[0], `${prefix}${nextNumber}`);
    }

    async function getPrivateRadioButtonLabel({ retries = 5, delay = CONFIG.GLOGAL_DELAY } = {}) {
        for (let i = 0; i < retries; i++) {
            const matches = Array.from(document.querySelectorAll('.tp-yt-paper-radio-button'))
                .filter(el => el.textContent.includes('Private'));

            if (matches.length === 1) {
                return matches[0];
            } else if (matches.length > 1) {
                throw new Error('Multiple tp-yt-paper-radio-button elements contain "Private".');
            }

            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, delay));
            }
        }

        throw new Error('No tp-yt-paper-radio-button element contains "Private" after retries.');
    }

    async function mainFlow({ videoToPublish }) {
        const convertedVideoName = normalizeFilename(videoToPublish.originalVideoName);
        console.log('convertedVideoName: ', convertedVideoName);

        const draftAnchorTag = await getElementContainingText({ tag: 'a', text: convertedVideoName });
        draftAnchorTag.click();

        await waitMilliseconds(700);

        const reuseDetailsButton = await getElementContainingText({ tag: 'div', text: 'Reuse details' });
        reuseDetailsButton.click();

        const videoDetailsModal = reuseDetailsButton.closest('tp-yt-paper-dialog');

        await waitMilliseconds(700);

        const searchYourVideosInput = await getElementByPlaceholder('input', 'Search your videos');
        const stringToSearch = `${videoToPublish.latestAudioTitleToBasedOn} - AUDIO ${getTypeOfAudio(convertedVideoName)}`;
        searchYourVideosInput.value = stringToSearch;
        searchYourVideosInput.dispatchEvent(new Event('input', { bubbles: true }));

        await waitMilliseconds(700);

        const previousVideoToSelect = await getElementContainingText({ tag: 'div', text: stringToSearch });
        previousVideoToSelect.click();

        await waitMilliseconds(700);

        const modalTitle = await getElementContainingText({ tag: 'h2', text: 'Select the details you would like to reuse' });
        const searchDialog = modalTitle.closest('tp-yt-paper-dialog');

        const reuseButtonInDialog = await getElementContainingText({ tag: 'div', text: 'Reuse', elementToQueryIn: searchDialog })
        reuseButtonInDialog.click();

        await waitMilliseconds(700);

        const titleCustomInput = await getElementByAriaLabelContains({
            text: "Add a title that describes your video", elementToQueryIn: videoDetailsModal
        });

        await simulateTypingInCustomInput({ element: titleCustomInput, text: incrementParteNumber(stringToSearch), delay: 5 });

        const nextButton = await getElementContainingText({ tag: 'div', text: 'Next', elementToQueryIn: videoDetailsModal });
        nextButton.click();

        await waitMilliseconds(300);

        const nextButton2 = await getElementContainingText({ tag: 'div', text: 'Next', elementToQueryIn: videoDetailsModal });
        nextButton2.click();

        await waitMilliseconds(300);

        const nextButton3 = await getElementContainingText({ tag: 'div', text: 'Next', elementToQueryIn: videoDetailsModal });
        nextButton3.click();

        await waitMilliseconds(300);

        const privateRadioButtonLabel = await getPrivateRadioButtonLabel();
        privateRadioButtonLabel.click();

        await waitMilliseconds(250);

        const saveButton = await getElementContainingText({ tag: 'div', text: 'Save', elementToQueryIn: videoDetailsModal });
        saveButton.click();

        await waitMilliseconds(2000);
    }

    const videosToPublish = [
        {
            latestAudioTitleToBasedOn: 'Ghost Recon: Wildlands - Parte 15',
            originalVideoName: 'ghost_recon_wildlands_2025-06-17 21-13-35--PART-2-NO-NEED-FOR-VIDEO-EDITED--PROCESSED--AUDIO-GAME.mp4'
        },
        {
            latestAudioTitleToBasedOn: 'Ghost Recon: Wildlands - Parte 15',
            originalVideoName: 'ghost_recon_wildlands_2025-06-17 21-13-35--PART-2-NO-NEED-FOR-VIDEO-EDITED--PROCESSED--AUDIO-MIXED.mp4'
        },
        {
            latestAudioTitleToBasedOn: 'Ghost Recon: Wildlands - Parte 15',
            originalVideoName: 'ghost_recon_wildlands_2025-06-17 21-13-35--PART-2-NO-NEED-FOR-VIDEO-EDITED--PROCESSED--AUDIO-VOICE1.mp4'
        },
        {
            latestAudioTitleToBasedOn: 'Ghost Recon: Wildlands - Parte 15',
            originalVideoName: 'ghost_recon_wildlands_2025-06-17 21-13-35--PART-2-NO-NEED-FOR-VIDEO-EDITED--PROCESSED--AUDIO-VOICE2.mp4'
        },
    ]

    for (let index = 0; index < videosToPublish.length; index++) {
        const currentVideo = videosToPublish[index];
        await mainFlow({ videoToPublish: currentVideo });
    }

    console.log('\n\nALL FINISHED\n\n');
})()