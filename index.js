/**
 * Typing Indicator+ for SillyTavern
 * 
 * An enhanced typing indicator extension with multiple visual styles,
 * sound effects, and customization options.
 * 
 * @license AGPL-3.0
 * @copyright Original work Copyright (C) Cohee1207
 * @copyright Modified work Copyright (C) Loggo
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * CREDITS:
 * - Original extension created by Cohee1207
 *   GitHub: https://github.com/Cohee1207
 *   Original repo: https://github.com/SillyTavern/Extension-TypingIndicator
 * 
 * - Enhanced version (Typing Indicator+) by Loggo
 *   Modifications: Added 7 visual styles, 4 animation themes, avatar support,
 *                  sound effects, mobile optimization, user typing indicator, etc.
 * 
 * This is a fork of the original extension with additional features.
 * All credit for the original concept and base implementation goes to Cohee1207.
 */

import {
    name1,
    name2,
    user_avatar,
    eventSource,
    event_types,
    saveSettingsDebounced,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { t } from '../../../i18n.js';

const MODULE = 'typing_indicator_plus';

/**
 * @typedef {Object} TypingIndicatorSettings
 * @property {boolean} enabled
 * @property {string} style
 * @property {string} customText
 * @property {boolean} showAvatar
 * @property {string} position
 * @property {string} animationTheme
 * @property {boolean} soundEnabled
 * @property {number} soundVolume
 * @property {boolean} simulatePauses
 * @property {number} pauseChance
 */

const defaultSettings = {
    // General
    enabled: true,
    style: 'discord',
    position: 'inline',
    animationTheme: 'smooth',
    mobileMode: true,

    // Character Indicator
    customText: '{{char}} is typing...',
    showAvatar: true,

    // User Indicator  
    userTypingEnabled: false,
    userCustomText: '{{user}} is typing...',
    showUserAvatar: true,

    // Sound
    soundEnabled: false,
    soundVolume: 0.3,

    // Animation
    simulatePauses: false,
    pauseChance: 0.5,
};

// Audio context for generating click sounds
let audioCtx = null;

/**
 * Initialize audio context (must be called after user interaction)
 */
function initAudioContext() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }
    return audioCtx;
}

let pauseTimeout = null;
let soundInterval = null;
let isIndicatorVisible = false;

/**
 * Get the settings for this extension.
 * @returns {TypingIndicatorSettings} Settings object
 */
function getSettings() {
    if (extension_settings[MODULE] === undefined) {
        extension_settings[MODULE] = structuredClone(defaultSettings);
    }

    for (const key in defaultSettings) {
        if (extension_settings[MODULE][key] === undefined) {
            extension_settings[MODULE][key] = defaultSettings[key];
        }
    }

    return extension_settings[MODULE];
}

/**
 * Get the character avatar URL - comprehensive selector approach
 * @returns {string} Avatar URL or empty string
 */
function getCharacterAvatar() {
    // Method 1: Get from the most recent CHARACTER message (not user)
    // SillyTavern marks character messages with is_user="false"
    const charMsgs = document.querySelectorAll('#chat .mes[is_user="false"] .avatar img');
    if (charMsgs.length > 0) {
        const lastCharAvatar = charMsgs[charMsgs.length - 1];
        if (lastCharAvatar && lastCharAvatar.src && !lastCharAvatar.src.includes('User Avatars')) {
            return lastCharAvatar.src;
        }
    }

    // Method 2: Try getting from character info panel on the right
    const rightPanelAvatar = document.querySelector('#rm_print_characters_block .avatar img');
    if (rightPanelAvatar && rightPanelAvatar.src) {
        return rightPanelAvatar.src;
    }

    // Method 3: Selected character in character list
    const selectedChar = document.querySelector('.character_select.selected .avatar img');
    if (selectedChar && selectedChar.src) {
        return selectedChar.src;
    }

    // Method 4: Expression/sprite image as fallback
    const expression = document.querySelector('#expression-image');
    if (expression && expression.src && expression.style.display !== 'none') {
        return expression.src;
    }

    return '';
}

/**
 * Play typing sound effect using Web Audio API - iPhone keyboard style
 * @param {number} volume Volume level (0-1)
 */
function playTypingSound(volume) {
    try {
        const ctx = initAudioContext();
        if (!ctx) return;

        // Resume context if suspended (browser autoplay policy)
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const now = ctx.currentTime;
        const vol = Math.min(1, Math.max(0, volume)) * 0.25;

        // === iPhone keyboard tap sound ===
        // Consists of a short "tick" with slight variation

        // Main tone - sine wave for soft tick
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        // iPhone tick is around 1200-1400Hz with quick drop
        osc1.frequency.setValueAtTime(1300 + Math.random() * 100, now);
        osc1.frequency.exponentialRampToValueAtTime(400, now + 0.025);

        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(vol, now + 0.002);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.04);

        // Secondary higher harmonic for "tap" quality
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(2600 + Math.random() * 200, now);
        osc2.frequency.exponentialRampToValueAtTime(800, now + 0.015);

        gain2.gain.setValueAtTime(0, now);
        gain2.gain.linearRampToValueAtTime(vol * 0.3, now + 0.001);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now);
        osc2.stop(now + 0.025);

        // Subtle click noise burst
        const bufferSize = ctx.sampleRate * 0.015; // 15ms of noise
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
        }

        const noiseSource = ctx.createBufferSource();
        const noiseGain = ctx.createGain();
        const noiseFilter = ctx.createBiquadFilter();

        noiseSource.buffer = noiseBuffer;
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 3000;

        noiseGain.gain.setValueAtTime(vol * 0.08, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noiseSource.start(now);
        noiseSource.stop(now + 0.02);

    } catch (e) {
        // Silently fail - audio not critical
    }
}

/**
 * Generate the dots animation SVG based on theme
 * @param {string} theme Animation theme
 * @param {string} style Visual style
 * @returns {string} SVG HTML
 */
function generateDotsAnimation(theme, style) {
    const animations = {
        smooth: {
            keyframes: `
                @keyframes smoothFade {
                    0%, 100% { opacity: 0.2; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.1); }
                }
            `,
            timing: 'cubic-bezier(0.4, 0, 0.6, 1)',
            duration: '1.4s',
        },
        playful: {
            keyframes: `
                @keyframes playfulBounce {
                    0%, 100% { transform: translateY(0) scale(1); }
                    50% { transform: translateY(-6px) scale(1.15); }
                }
            `,
            timing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
            duration: '0.7s',
        },
        minimal: {
            keyframes: `
                @keyframes minimalFade {
                    0%, 100% { opacity: 0.3; }
                    50% { opacity: 0.9; }
                }
            `,
            timing: 'ease-in-out',
            duration: '1.8s',
        },
        wave: {
            keyframes: `
                @keyframes waveDot {
                    0%, 100% { transform: translateY(0); }
                    25% { transform: translateY(-5px); }
                    75% { transform: translateY(2px); }
                }
            `,
            timing: 'ease-in-out',
            duration: '1s',
        },
    };

    const anim = animations[theme] || animations.smooth;
    const animName = theme === 'playful' ? 'playfulBounce' :
        theme === 'minimal' ? 'minimalFade' :
            theme === 'wave' ? 'waveDot' : 'smoothFade';

    // SVG dots for most styles
    return `
        <span class="typing-dots-container">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="16" viewBox="0 0 28 16">
                <style>
                    ${anim.keyframes}
                    .typing-dot-1 { animation: ${animName} ${anim.duration} ${anim.timing} 0s infinite; }
                    .typing-dot-2 { animation: ${animName} ${anim.duration} ${anim.timing} 0.15s infinite; }
                    .typing-dot-3 { animation: ${animName} ${anim.duration} ${anim.timing} 0.3s infinite; }
                </style>
                <circle class="typing-dot-1" cx="4" cy="8" r="3" fill="currentColor"/>
                <circle class="typing-dot-2" cx="14" cy="8" r="3" fill="currentColor"/>
                <circle class="typing-dot-3" cx="24" cy="8" r="3" fill="currentColor"/>
            </svg>
        </span>
    `;
}

/**
 * Generate indicator HTML based on style
 * @param {TypingIndicatorSettings} settings
 * @returns {string} HTML content
 */
function generateIndicatorHTML(settings, isUser = false) {
    const name = isUser ? (name1 || 'You') : (name2 || 'Character');
    const text = isUser
        ? (settings.userCustomText || '{{user}} is typing...').replace(/\{\{user\}\}/gi, name)
        : (settings.customText || '{{char}} is typing...').replace(/\{\{char\}\}/gi, name);
    const avatarUrl = isUser
        ? (settings.showUserAvatar ? getUserAvatar() : '')
        : (settings.showAvatar ? getCharacterAvatar() : '');
    const dots = generateDotsAnimation(settings.animationTheme, settings.style);

    const avatarHTML = avatarUrl ? `
        <div class="typing-avatar ${settings.style === 'pulsing_avatar' ? 'pulsing' : ''}">
            <img src="${avatarUrl}" alt="${name}" onerror="this.style.display='none'" />
        </div>
    ` : '';

    // Fallback avatar with initial
    const fallbackAvatar = `
        <div class="typing-avatar pulsing placeholder">
            <span>${name.charAt(0).toUpperCase()}</span>
        </div>
    `;

    switch (settings.style) {
        case 'speech_bubble':
            return `
                <div class="typing-content-wrapper typing-bubble-wrapper">
                    ${avatarHTML}
                    <div class="typing-bubble">
                        <span class="typing-text">${text}</span>
                        ${dots}
                    </div>
                </div>
            `;

        case 'bouncing_dots':
            return `
                <div class="typing-content-wrapper typing-bouncing-wrapper">
                    ${avatarHTML}
                    <div class="typing-bouncing-content">
                        ${dots}
                        <span class="typing-text-small">${name}</span>
                    </div>
                </div>
            `;

        case 'pulsing_avatar':
            return `
                <div class="typing-content-wrapper typing-pulsing-wrapper">
                    ${avatarHTML || fallbackAvatar}
                    <span class="typing-text">${text}</span>
                </div>
            `;

        case 'wave_dots':
            return `
                <div class="typing-content-wrapper typing-wave-wrapper">
                    ${avatarHTML}
                    ${dots}
                    <span class="typing-text-fade">${text}</span>
                </div>
            `;

        case 'minimal':
            return `
                <div class="typing-content-wrapper typing-minimal-wrapper">
                    <span class="typing-text-minimal">${text}</span>
                    ${dots}
                </div>
            `;

        case 'discord':
            return `
                <div class="typing-content-wrapper typing-discord-wrapper">
                    ${avatarHTML}
                    <div class="typing-discord-content">
                        <div class="discord-dots">
                            <span></span><span></span><span></span>
                        </div>
                        <span class="typing-text-discord"><strong>${name}</strong> is typing...</span>
                    </div>
                </div>
            `;

        case 'classic':
        default:
            return `
                <div class="typing-content-wrapper typing-classic-wrapper">
                    ${avatarHTML}
                    <span class="typing-text">${text}</span>
                    ${dots}
                </div>
            `;
    }
}

/**
 * Shows a typing indicator in the chat.
 * @param {string} type Generation type
 * @param {any} _args Generation arguments
 * @param {boolean} dryRun Is this a dry run?
 */
function showTypingIndicator(type, _args, dryRun) {
    const settings = getSettings();
    const noIndicatorTypes = ['quiet', 'impersonate'];

    if (noIndicatorTypes.includes(type) || dryRun) {
        return;
    }

    if (!settings.enabled || !name2) {
        return;
    }

    // Clear any existing timers
    clearTimers();
    const htmlContent = generateIndicatorHTML(settings, false);
    const positionClass = `typing-position-${settings.position}`;
    const styleClass = `typing-style-${settings.style}`;
    const themeClass = `typing-theme-${settings.animationTheme}`;

    // Check if indicator already exists
    let typingIndicator = document.getElementById('typing_indicator_plus');

    if (typingIndicator) {
        // Update existing
        typingIndicator.innerHTML = htmlContent;
        typingIndicator.className = `typing_indicator_plus ${positionClass} ${styleClass} ${themeClass} visible`;
        return;
    }

    // Create new indicator
    typingIndicator = document.createElement('div');
    typingIndicator.id = 'typing_indicator_plus';
    typingIndicator.className = `typing_indicator_plus ${positionClass} ${styleClass} ${themeClass}`;
    typingIndicator.innerHTML = htmlContent;

    const chat = document.getElementById('chat');
    if (!chat) return;

    // Check scroll position BEFORE adding
    const scrollThreshold = 100;
    const wasAtBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < scrollThreshold;

    // Add to chat
    chat.appendChild(typingIndicator);
    isIndicatorVisible = true;

    // Force reflow then add visible class for animation
    typingIndicator.offsetHeight;
    typingIndicator.classList.add('visible');

    // Scroll to bottom if was at bottom
    if (wasAtBottom) {
        requestAnimationFrame(() => {
            chat.scrollTop = chat.scrollHeight;
        });
    }

    // Play sound if enabled
    if (settings.soundEnabled) {
        playTypingSound(settings.soundVolume);

        // Schedule repeating sounds
        soundInterval = setInterval(() => {
            if (isIndicatorVisible && settings.soundEnabled) {
                playTypingSound(settings.soundVolume * (0.6 + Math.random() * 0.4));
            }
        }, 300 + Math.random() * 200);
    }

    // Simulate pauses
    if (settings.simulatePauses) {
        schedulePause(settings);
    }
}

/**
 * Clear all timers
 */
function clearTimers() {
    if (pauseTimeout) {
        clearTimeout(pauseTimeout);
        pauseTimeout = null;
    }
    if (soundInterval) {
        clearInterval(soundInterval);
        soundInterval = null;
    }
}

/**
 * Schedule intermittent pauses in typing animation
 * @param {TypingIndicatorSettings} settings
 */
function schedulePause(settings) {
    const indicator = document.getElementById('typing_indicator_plus');
    if (!indicator || !isIndicatorVisible) return;

    const shouldPause = Math.random() < settings.pauseChance;
    const pauseDuration = 300 + Math.random() * 600;
    const nextCheck = 800 + Math.random() * 1500;

    if (shouldPause) {
        indicator.classList.add('paused');
        setTimeout(() => {
            const el = document.getElementById('typing_indicator_plus');
            if (el) el.classList.remove('paused');
        }, pauseDuration);
    }

    pauseTimeout = setTimeout(() => schedulePause(settings), nextCheck);
}

/**
 * Hides the typing indicator.
 */
function hideTypingIndicator() {
    isIndicatorVisible = false;
    clearTimers();

    const typingIndicator = document.getElementById('typing_indicator_plus');
    if (typingIndicator) {
        typingIndicator.classList.remove('visible');
        typingIndicator.classList.add('hiding');

        setTimeout(() => {
            const el = document.getElementById('typing_indicator_plus');
            if (el) el.remove();
        }, 250);
    }
}

/**
 * Draws the settings for this extension.
 * @param {TypingIndicatorSettings} settings Settings object
 */
function addExtensionSettings(settings) {
    const settingsContainer = document.getElementById('typing_indicator_container') ?? document.getElementById('extensions_settings');
    if (!settingsContainer) return;

    const inlineDrawer = document.createElement('div');
    inlineDrawer.classList.add('inline-drawer');
    settingsContainer.append(inlineDrawer);

    const inlineDrawerToggle = document.createElement('div');
    inlineDrawerToggle.classList.add('inline-drawer-toggle', 'inline-drawer-header');

    const extensionName = document.createElement('b');
    extensionName.textContent = t`Typing Indicator+`;

    const inlineDrawerIcon = document.createElement('div');
    inlineDrawerIcon.classList.add('inline-drawer-icon', 'fa-solid', 'fa-circle-chevron-down', 'down');

    inlineDrawerToggle.append(extensionName, inlineDrawerIcon);

    const inlineDrawerContent = document.createElement('div');
    inlineDrawerContent.classList.add('inline-drawer-content');
    inlineDrawerContent.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

    inlineDrawer.append(inlineDrawerToggle, inlineDrawerContent);

    // Helper to create settings
    const createCheckbox = (label, checked, onChange) => {
        const wrapper = document.createElement('label');
        wrapper.classList.add('checkbox_label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.addEventListener('change', () => { onChange(input.checked); saveSettingsDebounced(); });
        const span = document.createElement('span');
        span.textContent = label;
        wrapper.append(input, span);
        return wrapper;
    };

    const createSelect = (label, options, value, onChange) => {
        const wrapper = document.createElement('div');
        wrapper.classList.add('typing-setting-row');
        const lbl = document.createElement('label');
        lbl.textContent = label;
        const select = document.createElement('select');
        select.classList.add('text_pole');
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            o.selected = value === opt.value;
            select.appendChild(o);
        });
        select.addEventListener('change', () => { onChange(select.value); saveSettingsDebounced(); });
        wrapper.append(lbl, select);
        return wrapper;
    };

    // Helper to create category header
    const createHeader = (text) => {
        const header = document.createElement('div');
        header.style.cssText = 'font-weight:bold;margin-top:12px;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.1);font-size:13px;';
        header.textContent = text;
        return header;
    };

    // ========== GENERAL ==========
    inlineDrawerContent.append(createHeader('⚙️ General'));

    inlineDrawerContent.append(
        createCheckbox(t`Enabled`, settings.enabled, v => settings.enabled = v)
    );

    inlineDrawerContent.append(
        createSelect(t`Visual Style`, [
            { value: 'classic', label: 'Classic' },
            { value: 'speech_bubble', label: 'Speech Bubble' },
            { value: 'bouncing_dots', label: 'Bouncing Dots' },
            { value: 'pulsing_avatar', label: 'Pulsing Avatar' },
            { value: 'wave_dots', label: 'Wave Dots' },
            { value: 'minimal', label: 'Minimal' },
            { value: 'discord', label: 'Discord Style' },
        ], settings.style, v => settings.style = v)
    );

    inlineDrawerContent.append(
        createSelect(t`Position`, [
            { value: 'bottom', label: 'Bottom (Sticky)' },
            { value: 'inline', label: 'Inline (After Messages)' },
            { value: 'floating', label: 'Floating (Overlay)' },
        ], settings.position, v => settings.position = v)
    );

    inlineDrawerContent.append(
        createSelect(t`Animation Theme`, [
            { value: 'smooth', label: 'Smooth' },
            { value: 'playful', label: 'Playful (Bouncy)' },
            { value: 'minimal', label: 'Minimal' },
            { value: 'wave', label: 'Wave' },
        ], settings.animationTheme, v => settings.animationTheme = v)
    );

    // Mobile mode toggle
    inlineDrawerContent.append(
        createCheckbox(t`Mobile-optimized mode`, settings.mobileMode, v => {
            settings.mobileMode = v;
            updateMobileMode(v);
        })
    );

    // ========== CHARACTER INDICATOR ==========
    inlineDrawerContent.append(createHeader('🤖 Character Indicator'));

    // Custom text for character
    const charTextRow = document.createElement('div');
    charTextRow.classList.add('typing-setting-row');
    const charTextLabel = document.createElement('label');
    charTextLabel.textContent = t`Custom Text`;
    const charTextInput = document.createElement('input');
    charTextInput.type = 'text';
    charTextInput.classList.add('text_pole');
    charTextInput.value = settings.customText;
    charTextInput.placeholder = '{{char}} is typing...';
    charTextInput.addEventListener('input', () => { settings.customText = charTextInput.value; saveSettingsDebounced(); });
    const charTextHint = document.createElement('small');
    charTextHint.textContent = 'Use {{char}} for character name';
    charTextHint.style.opacity = '0.6';
    charTextRow.append(charTextLabel, charTextInput, charTextHint);
    inlineDrawerContent.append(charTextRow);

    inlineDrawerContent.append(
        createCheckbox(t`Show Character Avatar`, settings.showAvatar, v => settings.showAvatar = v)
    );

    // ========== USER INDICATOR ==========
    inlineDrawerContent.append(createHeader('👤 User Indicator'));

    inlineDrawerContent.append(
        createCheckbox(t`Show user typing indicator`, settings.userTypingEnabled, v => settings.userTypingEnabled = v)
    );

    // Custom text for user
    const userTextRow = document.createElement('div');
    userTextRow.classList.add('typing-setting-row');
    const userTextLabel = document.createElement('label');
    userTextLabel.textContent = t`User Text`;
    const userTextInput = document.createElement('input');
    userTextInput.type = 'text';
    userTextInput.classList.add('text_pole');
    userTextInput.value = settings.userCustomText;
    userTextInput.placeholder = '{{user}} is typing...';
    userTextInput.addEventListener('input', () => { settings.userCustomText = userTextInput.value; saveSettingsDebounced(); });
    const userTextHint = document.createElement('small');
    userTextHint.textContent = 'Use {{user}} for persona name';
    userTextHint.style.opacity = '0.6';
    userTextRow.append(userTextLabel, userTextInput, userTextHint);
    inlineDrawerContent.append(userTextRow);

    inlineDrawerContent.append(
        createCheckbox(t`Show User Avatar`, settings.showUserAvatar, v => settings.showUserAvatar = v)
    );

    // ========== SOUND & ANIMATION ==========
    inlineDrawerContent.append(createHeader('🔊 Sound & Animation'));

    // Sound checkbox
    const soundCheckbox = createCheckbox(t`Enable Typing Sounds`, settings.soundEnabled, v => {
        settings.soundEnabled = v;
        volumeRow.style.display = v ? 'flex' : 'none';
    });
    inlineDrawerContent.append(soundCheckbox);

    // Volume slider
    const volumeRow = document.createElement('div');
    volumeRow.classList.add('typing-setting-row');
    volumeRow.style.display = settings.soundEnabled ? 'flex' : 'none';
    const volumeLabel = document.createElement('label');
    volumeLabel.textContent = t`Sound Volume`;
    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.min = '0';
    volumeSlider.max = '1';
    volumeSlider.step = '0.1';
    volumeSlider.value = String(settings.soundVolume);
    volumeSlider.addEventListener('input', () => { settings.soundVolume = parseFloat(volumeSlider.value); saveSettingsDebounced(); });
    volumeRow.append(volumeLabel, volumeSlider);
    inlineDrawerContent.append(volumeRow);

    inlineDrawerContent.append(
        createCheckbox(t`Simulate Typing Pauses`, settings.simulatePauses, v => settings.simulatePauses = v)
    );

    // Apply mobile mode on load
    updateMobileMode(settings.mobileMode);
}

/**
 * Update mobile mode class on body
 * @param {boolean} enabled
 */
function updateMobileMode(enabled) {
    if (enabled) {
        document.body.classList.add('typing-indicator-mobile-mode');
    } else {
        document.body.classList.remove('typing-indicator-mobile-mode');
    }
}

/**
 * Get the user/persona avatar URL
 * @returns {string} Avatar URL or empty string
 */
function getUserAvatar() {
    // Try to get from user_avatar global
    if (user_avatar && typeof user_avatar === 'string') {
        // user_avatar contains just the filename, need to build full path
        return `/User Avatars/${user_avatar}`;
    }

    // Try to get from user's last message
    const userMsgs = document.querySelectorAll('#chat .mes[is_user="true"] .avatar img');
    if (userMsgs.length > 0) {
        const lastUserAvatar = userMsgs[userMsgs.length - 1];
        if (lastUserAvatar && lastUserAvatar.src) {
            return lastUserAvatar.src;
        }
    }

    return '';
}

/**
 * Show user typing indicator
 */
let userTypingTimeout = null;
function showUserTypingIndicator() {
    const settings = getSettings();
    if (!settings.enabled || !settings.userTypingEnabled) return;

    // Clear existing timeout
    if (userTypingTimeout) {
        clearTimeout(userTypingTimeout);
    }

    // Get indicator content
    const htmlContent = generateIndicatorHTML(settings, true);

    // Check if user indicator already exists
    let indicator = document.getElementById('typing_indicator_user');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'typing_indicator_user';

        const sendForm = document.getElementById('send_form');
        if (sendForm) {
            sendForm.parentNode.insertBefore(indicator, sendForm);
        }
    }

    // Update state and content
    indicator.className = `typing_indicator_plus typing-user-indicator typing-position-${settings.position} typing-style-${settings.style} visible`;
    indicator.innerHTML = htmlContent;

    // Hide after 600ms of no typing
    userTypingTimeout = setTimeout(() => {
        hideUserTypingIndicator();
    }, 600);
}

/**
 * Hide user typing indicator immediately
 */
function hideUserTypingIndicator() {
    if (userTypingTimeout) {
        clearTimeout(userTypingTimeout);
        userTypingTimeout = null;
    }
    const el = document.getElementById('typing_indicator_user');
    if (el) el.remove();
}

// Initialize
(function () {
    const settings = getSettings();
    addExtensionSettings(settings);

    const showEvents = [event_types.GENERATION_AFTER_COMMANDS];
    const hideEvents = [event_types.GENERATION_STOPPED, event_types.GENERATION_ENDED, event_types.CHAT_CHANGED];

    showEvents.forEach(e => eventSource.on(e, showTypingIndicator));
    hideEvents.forEach(e => eventSource.on(e, hideTypingIndicator));

    // Hide user typing indicator when message is sent
    eventSource.on(event_types.MESSAGE_SENT, hideUserTypingIndicator);

    // User typing indicator - listen to input events
    const textarea = document.getElementById('send_textarea');
    if (textarea) {
        textarea.addEventListener('input', showUserTypingIndicator);
    }

    // Apply mobile mode on load
    updateMobileMode(settings.mobileMode);
})();

