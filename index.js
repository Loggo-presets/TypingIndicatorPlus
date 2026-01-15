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
    chat,
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
    customThinkingText: '{{char}} is thinking...',
    thinkingIcon: '🧠',
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

    // Timeouts
    userTypingTimeoutMs: 600,

    // v3.0.0 Features
    soundTheme: 'ios',
    showThinking: true,  // Experimental thinking detection
    groupChatSupport: false,

    // Glow settings
    glowEnabled: true,
    glowGradient: false,
    glowColor: '#738adb',
    glowColor2: '#a855f7',
    userGlowColor: '#5cb85c',
    userGlowColor2: '#22c55e',
    userRightAlign: false, // New feature: align user indicator to right

    // Name color settings
    nameGradient: false,
    charNameColor: '#738adb',
    charNameColor2: '#a855f7',
    userNameColor: '#5cb85c',
    userNameColor2: '#22c55e',
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
let isCharThinking = false;
let typingCharacters = new Set(); // For Group Chat support
let thinkingObserver = null;      // MutationObserver for thinking icon

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
 * Play typing sound effect using Web Audio API
 * @param {number} volume Volume level (0-1)
 * @param {string} theme Sound theme
 */
function playTypingSound(volume, theme = 'ios') {
    try {
        const ctx = initAudioContext();
        if (!ctx) return;

        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const now = ctx.currentTime;
        const vol = Math.min(1, Math.max(0, volume)) * 0.25;

        switch (theme) {
            case 'mechanical': {
                // Low thud
                const osc1 = ctx.createOscillator();
                const gain1 = ctx.createGain();
                osc1.type = 'triangle';
                osc1.frequency.setValueAtTime(100 + Math.random() * 20, now);
                osc1.frequency.exponentialRampToValueAtTime(40, now + 0.08);
                gain1.gain.setValueAtTime(vol * 0.8, now);
                gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                osc1.connect(gain1);
                gain1.connect(ctx.destination);
                osc1.start(now);
                osc1.stop(now + 0.1);

                // Metallic click
                const osc2 = ctx.createOscillator();
                const gain2 = ctx.createGain();
                osc2.type = 'square';
                osc2.frequency.setValueAtTime(2500 + Math.random() * 500, now);
                gain2.gain.setValueAtTime(vol * 0.15, now);
                gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
                osc2.connect(gain2);
                gain2.connect(ctx.destination);
                osc2.start(now);
                osc2.stop(now + 0.02);
                break;
            }
            case 'retro': {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(800 + Math.random() * 100, now);
                osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
                gain.gain.setValueAtTime(vol * 0.4, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.06);
                break;
            }
            case 'soft': {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(400 + Math.random() * 50, now);
                gain.gain.setValueAtTime(vol * 0.5, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.04);
                break;
            }
            case 'osu': {
                // Osu! hit circle style - punchy, crisp click
                const osc1 = ctx.createOscillator();
                const gain1 = ctx.createGain();
                osc1.type = 'sine';
                osc1.frequency.setValueAtTime(1000 + Math.random() * 50, now);
                osc1.frequency.exponentialRampToValueAtTime(600, now + 0.02);
                gain1.gain.setValueAtTime(vol * 1.2, now);
                gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
                osc1.connect(gain1);
                gain1.connect(ctx.destination);
                osc1.start(now);
                osc1.stop(now + 0.035);

                // Higher frequency overlay for crisp "click"
                const osc2 = ctx.createOscillator();
                const gain2 = ctx.createGain();
                osc2.type = 'sine';
                osc2.frequency.setValueAtTime(2200 + Math.random() * 100, now);
                gain2.gain.setValueAtTime(vol * 0.4, now);
                gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
                osc2.connect(gain2);
                gain2.connect(ctx.destination);
                osc2.start(now);
                osc2.stop(now + 0.02);
                break;
            }
            case 'ios':
            default: {
                // Original iOS style tick
                const osc1 = ctx.createOscillator();
                const gain1 = ctx.createGain();
                osc1.type = 'sine';
                osc1.frequency.setValueAtTime(1300 + Math.random() * 100, now);
                osc1.frequency.exponentialRampToValueAtTime(400, now + 0.025);
                gain1.gain.setValueAtTime(vol, now);
                gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
                osc1.connect(gain1);
                gain1.connect(ctx.destination);
                osc1.start(now);
                osc1.stop(now + 0.04);

                const bufferSize = ctx.sampleRate * 0.01;
                const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const noiseData = noiseBuffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
                }
                const noiseSource = ctx.createBufferSource();
                const noiseGain = ctx.createGain();
                noiseSource.buffer = noiseBuffer;
                noiseGain.gain.setValueAtTime(vol * 0.1, now);
                noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.01);
                noiseSource.connect(noiseGain);
                noiseGain.connect(ctx.destination);
                noiseSource.start(now);
                break;
            }
        }
    } catch (e) {
        console.warn('Sound playback failed', e);
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
function generateIndicatorHTML(settings, isUser = false, isThinking = false) {
    let name = isUser ? (name1 || 'You') : (name2 || 'Character');

    // Group Chat support: If multiple characters are typing, update name
    if (!isUser && settings.groupChatSupport && typingCharacters.size > 1) {
        const names = Array.from(typingCharacters);
        if (names.length === 2) {
            name = `${names[0]} and ${names[1]}`;
        } else {
            name = `${names[0]} and ${names.length - 1} others`;
        }
    }

    const text = isUser
        ? (settings.userCustomText || '{{user}} is typing...').replace(/\{\{user\}\}/gi, name)
        : (isThinking && settings.showThinking
            ? (settings.customThinkingText || '{{char}} is thinking...').replace(/{{char}}/gi, name)
            : (settings.customText || '{{char}} is typing...').replace(/{{char}}/gi, name));

    // For Discord style, we need common text without the name
    const textSuffix = isUser
        ? (settings.userCustomText || '{{user}} is typing...').replace(/{{user}}/gi, '').trim()
        : (isThinking && settings.showThinking
            ? (settings.customThinkingText || '{{char}} is thinking...').replace(/{{char}}/gi, '').trim()
            : (settings.customText || '{{char}} is typing...').replace(/{{char}}/gi, '').trim());

    // Generate name color styling
    const nameColor1 = isUser ? (settings.userNameColor || '#5cb85c') : (settings.charNameColor || '#738adb');
    const nameColor2 = isUser ? (settings.userNameColor2 || '#22c55e') : (settings.charNameColor2 || '#a855f7');
    const nameStyle = settings.nameGradient
        ? `background:linear-gradient(90deg,${nameColor1},${nameColor2});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;`
        : `color:${nameColor1};`;
    const styledName = `<span style="${nameStyle}font-weight:bold;">${name}</span>`;

    const avatarUrl = isUser
        ? (settings.showUserAvatar ? getUserAvatar() : '')
        : (settings.showAvatar ? getCharacterAvatar() : '');

    // Use different dots/icon for thinking
    const thinkingIconEmoji = settings.thinkingIcon || '🧠';
    const dots = isThinking && settings.showThinking
        ? `<div class="typing-thinking-icon">${thinkingIconEmoji}</div>`
        : generateDotsAnimation(settings.animationTheme, settings.style);

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
                        <span class="typing-text-small">${styledName}</span>
                        ${dots}
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
                    <span class="typing-text-fade">${text}</span>
                    ${dots}
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
                        <span class="typing-text-discord">${styledName} ${textSuffix}</span>
                        ${dots}
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

    // Rejoice Flow: Start as "Typing" until thinking is specifically detected
    isCharThinking = false;

    // Track character for group chat
    if (settings.groupChatSupport && _args && _args.character_name) {
        typingCharacters.add(_args.character_name);
    }

    const htmlContent = generateIndicatorHTML(settings, false, isCharThinking);
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
    typingIndicator.className = `typing_indicator_plus ${positionClass} ${styleClass} ${themeClass} `;
    typingIndicator.innerHTML = htmlContent;

    const chat = document.getElementById('chat');
    if (!chat) return;

    // Check scroll position BEFORE adding
    const scrollThreshold = 100;
    const wasAtBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < scrollThreshold;

    // Add to chat
    chat.appendChild(typingIndicator);
    isIndicatorVisible = true;

    // Apply character glow color (or disable glow)
    if (settings.glowEnabled !== false) {
        typingIndicator.style.setProperty('--indicator-glow', settings.glowColor);
    } else {
        typingIndicator.style.setProperty('--indicator-glow', 'transparent');
    }

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
        playTypingSound(settings.soundVolume, settings.soundTheme);

        // Schedule repeating sounds
        soundInterval = setInterval(() => {
            if (isIndicatorVisible && settings.soundEnabled) {
                playTypingSound(settings.soundVolume * (0.6 + Math.random() * 0.4), settings.soundTheme);
            }
        }, 300 + Math.random() * 200);
    }

    // Start thinking detection observer (only reacts to NEW elements)
    initThinkingObserver();

    // Simulate pauses
    if (settings.simulatePauses && !isCharThinking) {
        schedulePause(settings);
    }
}

/**
 * Handle message chunk events
 */
function handleMessageChunk() {
    // No longer needed for watchdog, but keeping for potential future use
}

function clearTimers() {
    if (pauseTimeout) {
        clearTimeout(pauseTimeout);
        pauseTimeout = null;
    }
    if (soundInterval) {
        clearInterval(soundInterval);
        soundInterval = null;
    }
    if (thinkingObserver) {
        thinkingObserver.disconnect();
        thinkingObserver = null;
    }
    // Always reset thinking state when clearing
    isCharThinking = false;
}

/**
 * Initialize MutationObserver for thinking icon detection
 */
function initThinkingObserver() {
    const settings = getSettings();
    if (!settings.showThinking) {
        console.log('[TIP+] showThinking is disabled, skipping observer');
        return;
    }
    if (thinkingObserver) {
        console.log('[TIP+] Observer already running');
        return;
    }

    const chatContainer = document.getElementById('chat');
    if (!chatContainer) {
        console.log('[TIP+] #chat not found!');
        return;
    }

    thinkingObserver = new MutationObserver((mutations) => {
        if (!isIndicatorVisible) return;

        // Dynamic check: Find the current last message
        const allMessages = chatContainer.querySelectorAll('.mes');
        const currentLastMessage = allMessages.length > 0 ? allMessages[allMessages.length - 1] : null;

        if (!currentLastMessage) return;

        for (const mutation of mutations) {
            // Check for NEW reasoning details being added (thinking started)
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;

                    // Check if this node is or contains a reasoning details element
                    const isReasoningNode = node.classList?.contains('mes_reasoning_details');
                    const containsReasoning = node.querySelector?.('.mes_reasoning_details');
                    const reasoningDetails = isReasoningNode ? node : containsReasoning;

                    if (reasoningDetails) {
                        // Verify this belongs to the CURRENT last message
                        if (!currentLastMessage.contains(reasoningDetails) && reasoningDetails !== currentLastMessage) {
                            continue;
                        }

                        // Verify it's not already done (e.g. re-rendering old message)
                        // STRICT CHECK: Only activate if state is explicitly "thinking"
                        if (reasoningDetails.getAttribute('data-state') === 'thinking') {
                            isCharThinking = true;
                            updateThinkingUI();
                        }
                    }
                }
            }

            // Check for data-state attribute changes
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-state') {
                const target = mutation.target;
                const dataState = target.getAttribute('data-state');

                if (target.classList?.contains('mes_reasoning_details')) {
                    // Verify this belongs to the CURRENT last message
                    if (!currentLastMessage.contains(target)) {
                        continue;
                    }

                    // data-state="thinking" -> Switch to Thinking
                    if (dataState === 'thinking' && !isCharThinking) {
                        isCharThinking = true;
                        updateThinkingUI();
                    }
                    // data-state="done" -> Switch to Typing
                    else if (dataState === 'done' && isCharThinking) {
                        isCharThinking = false;
                        updateThinkingUI();
                    }
                }
            }
        }
    });

    // Helper to update indicator UI
    function updateThinkingUI() {
        const indicator = document.getElementById('typing_indicator_plus');
        if (indicator) {
            const htmlContent = generateIndicatorHTML(settings, false, isCharThinking);
            indicator.innerHTML = htmlContent;
            console.log('[TIP+] Indicator UI updated');
        }
    }

    thinkingObserver.observe(chatContainer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-state']
    });

    console.log('[TIP+] MutationObserver started successfully');
}

/**
 * Update active indicators with new glow color
 * @param {string} color Hex color
 */
function updateActiveGlowColors(color) {
    const indicators = document.querySelectorAll('.typing_indicator_plus');
    indicators.forEach(ind => {
        ind.style.setProperty('--indicator-glow', color);
    });
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
    extensionName.textContent = t`Typing Indicator + `;

    const inlineDrawerIcon = document.createElement('div');
    inlineDrawerIcon.classList.add('inline-drawer-icon', 'fa-solid', 'fa-circle-chevron-down', 'down');

    inlineDrawerToggle.append(extensionName, inlineDrawerIcon);

    const inlineDrawerContent = document.createElement('div');
    inlineDrawerContent.classList.add('inline-drawer-content');

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

    const createNumberInput = (label, value, placeholder, onChange) => {
        const row = document.createElement('div');
        row.classList.add('typing-setting-row');
        const lbl = document.createElement('label');
        lbl.textContent = label;
        const input = document.createElement('input');
        input.type = 'number';
        input.classList.add('text_pole');
        input.value = value;
        input.min = '0';
        input.placeholder = placeholder;
        input.addEventListener('input', () => { onChange(Number(input.value)); saveSettingsDebounced(); });
        row.append(lbl, input);
        return row;
    };

    const createColorPicker = (label, value, onChange) => {
        const row = document.createElement('div');
        row.classList.add('typing-setting-row');
        const lbl = document.createElement('label');
        lbl.textContent = label;
        const input = document.createElement('input');
        input.type = 'color';
        input.classList.add('text_pole');
        input.value = value;
        input.style.height = '30px';
        input.style.cursor = 'pointer';
        input.addEventListener('input', () => { onChange(input.value); saveSettingsDebounced(); });
        row.append(lbl, input);
        return row;
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

    // ========== CHARACTER INDICATOR ==========
    inlineDrawerContent.append(createHeader('🤖 Character Indicator'));

    // Custom text for character
    const charTextRow = document.createElement('div');
    charTextRow.classList.add('typing-setting-row');
    const charTextLabel = document.createElement('label');
    charTextLabel.textContent = t`Typing Text`;
    const charTextInput = document.createElement('input');
    charTextInput.type = 'text';
    charTextInput.classList.add('text_pole');
    charTextInput.value = settings.customText;
    charTextInput.placeholder = '{{char}} is typing...';
    charTextInput.addEventListener('input', () => { settings.customText = charTextInput.value; saveSettingsDebounced(); });
    charTextRow.append(charTextLabel, charTextInput);
    inlineDrawerContent.append(charTextRow);

    inlineDrawerContent.append(
        createCheckbox(t`Show Character Avatar`, settings.showAvatar, v => settings.showAvatar = v)
    );

    // Thinking detection subsection
    inlineDrawerContent.append(
        createCheckbox(t`Show "Thinking" Indicator`, settings.showThinking, v => settings.showThinking = v)
    );

    // Thinking text for character
    const charThinkingTextRow = document.createElement('div');
    charThinkingTextRow.classList.add('typing-setting-row');
    const charThinkingTextLabel = document.createElement('label');
    charThinkingTextLabel.textContent = t`Thinking Text`;
    const charThinkingTextInput = document.createElement('input');
    charThinkingTextInput.type = 'text';
    charThinkingTextInput.classList.add('text_pole');
    charThinkingTextInput.value = settings.customThinkingText || '{{char}} is thinking...';
    charThinkingTextInput.placeholder = '{{char}} is thinking...';
    charThinkingTextInput.addEventListener('input', () => { settings.customThinkingText = charThinkingTextInput.value; saveSettingsDebounced(); });
    charThinkingTextRow.append(charThinkingTextLabel, charThinkingTextInput);
    inlineDrawerContent.append(charThinkingTextRow);

    // Thinking icon emoji
    const thinkingIconRow = document.createElement('div');
    thinkingIconRow.classList.add('typing-setting-row');
    const thinkingIconLabel = document.createElement('label');
    thinkingIconLabel.textContent = t`Thinking Icon`;
    const thinkingIconInput = document.createElement('input');
    thinkingIconInput.type = 'text';
    thinkingIconInput.classList.add('text_pole');
    thinkingIconInput.value = settings.thinkingIcon || '🧠';
    thinkingIconInput.placeholder = '🧠';
    thinkingIconInput.style.width = '60px';
    thinkingIconInput.addEventListener('input', () => { settings.thinkingIcon = thinkingIconInput.value; saveSettingsDebounced(); });
    thinkingIconRow.append(thinkingIconLabel, thinkingIconInput);
    inlineDrawerContent.append(thinkingIconRow);

    // ========== USER INDICATOR ==========
    inlineDrawerContent.append(createHeader('👤 User Indicator'));

    inlineDrawerContent.append(
        createCheckbox(t`Enable User Typing Indicator`, settings.userTypingEnabled, v => settings.userTypingEnabled = v)
    );

    inlineDrawerContent.append(
        createCheckbox(t`Align to Right Side`, settings.userRightAlign, v => settings.userRightAlign = v)
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
    userTextRow.append(userTextLabel, userTextInput);
    inlineDrawerContent.append(userTextRow);

    inlineDrawerContent.append(
        createCheckbox(t`Show User Avatar`, settings.showUserAvatar, v => settings.showUserAvatar = v)
    );

    inlineDrawerContent.append(
        createNumberInput(t`Idle Timeout (ms)`, settings.userTypingTimeoutMs || 600, '600', v => settings.userTypingTimeoutMs = v)
    );

    // ========== VISUAL EFFECTS ==========
    inlineDrawerContent.append(createHeader('✨ Visual Effects'));

    // Glow settings with toggle
    const glowCheckbox = createCheckbox(t`Enable Glow Effect`, settings.glowEnabled !== false, v => {
        settings.glowEnabled = v;
        glowGradientRow.style.display = v ? 'flex' : 'none';
        glowCharRow.style.display = v ? 'flex' : 'none';
        glowUserRow.style.display = v ? 'flex' : 'none';
    });
    inlineDrawerContent.append(glowCheckbox);

    // Glow gradient toggle
    const glowGradientRow = createCheckbox(t`Gradient Glow`, settings.glowGradient || false, v => {
        settings.glowGradient = v;
        glowChar2Input.style.display = v ? 'inline-block' : 'none';
        glowUser2Input.style.display = v ? 'inline-block' : 'none';
        saveSettingsDebounced();
    });
    glowGradientRow.style.display = settings.glowEnabled !== false ? 'flex' : 'none';
    inlineDrawerContent.append(glowGradientRow);

    // Char glow colors
    const glowCharRow = document.createElement('div');
    glowCharRow.classList.add('typing-setting-row');
    glowCharRow.style.display = settings.glowEnabled !== false ? 'flex' : 'none';
    const glowCharLabel = document.createElement('label');
    glowCharLabel.textContent = t`Character Glow`;
    const glowCharInput = document.createElement('input');
    glowCharInput.type = 'color';
    glowCharInput.value = settings.glowColor || '#738adb';
    glowCharInput.style.cssText = 'width:32px;height:32px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);cursor:pointer;padding:0;';
    glowCharInput.addEventListener('input', () => { settings.glowColor = glowCharInput.value; updateActiveGlowColors(glowCharInput.value); saveSettingsDebounced(); });
    const glowChar2Input = document.createElement('input');
    glowChar2Input.type = 'color';
    glowChar2Input.value = settings.glowColor2 || '#a855f7';
    glowChar2Input.style.cssText = 'width:32px;height:32px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);cursor:pointer;padding:0;margin-left:8px;';
    glowChar2Input.style.display = settings.glowGradient ? 'inline-block' : 'none';
    glowChar2Input.addEventListener('input', () => { settings.glowColor2 = glowChar2Input.value; saveSettingsDebounced(); });
    glowCharRow.append(glowCharLabel, glowCharInput, glowChar2Input);
    inlineDrawerContent.append(glowCharRow);

    // User glow colors
    const glowUserRow = document.createElement('div');
    glowUserRow.classList.add('typing-setting-row');
    glowUserRow.style.display = settings.glowEnabled !== false ? 'flex' : 'none';
    const glowUserLabel = document.createElement('label');
    glowUserLabel.textContent = t`User Glow`;
    const glowUserInput = document.createElement('input');
    glowUserInput.type = 'color';
    glowUserInput.value = settings.userGlowColor || '#5cb85c';
    glowUserInput.style.cssText = 'width:32px;height:32px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);cursor:pointer;padding:0;';
    glowUserInput.addEventListener('input', () => { settings.userGlowColor = glowUserInput.value; saveSettingsDebounced(); });
    const glowUser2Input = document.createElement('input');
    glowUser2Input.type = 'color';
    glowUser2Input.value = settings.userGlowColor2 || '#22c55e';
    glowUser2Input.style.cssText = 'width:32px;height:32px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);cursor:pointer;padding:0;margin-left:8px;';
    glowUser2Input.style.display = settings.glowGradient ? 'inline-block' : 'none';
    glowUser2Input.addEventListener('input', () => { settings.userGlowColor2 = glowUser2Input.value; saveSettingsDebounced(); });
    glowUserRow.append(glowUserLabel, glowUserInput, glowUser2Input);
    inlineDrawerContent.append(glowUserRow);

    // Name gradient toggle
    const nameGradientCheckbox = createCheckbox(t`Gradient Name Colors`, settings.nameGradient || false, v => {
        settings.nameGradient = v;
        charName2Input.style.display = v ? 'inline-block' : 'none';
        userName2Input.style.display = v ? 'inline-block' : 'none';
        saveSettingsDebounced();
    });
    inlineDrawerContent.append(nameGradientCheckbox);

    // Char name colors
    const charNameRow = document.createElement('div');
    charNameRow.classList.add('typing-setting-row');
    const charNameLabel = document.createElement('label');
    charNameLabel.textContent = t`Character Name`;
    const charNameInput = document.createElement('input');
    charNameInput.type = 'color';
    charNameInput.value = settings.charNameColor || '#738adb';
    charNameInput.style.cssText = 'width:32px;height:32px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);cursor:pointer;padding:0;';
    charNameInput.addEventListener('input', () => { settings.charNameColor = charNameInput.value; saveSettingsDebounced(); });
    const charName2Input = document.createElement('input');
    charName2Input.type = 'color';
    charName2Input.value = settings.charNameColor2 || '#a855f7';
    charName2Input.style.cssText = 'width:32px;height:32px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);cursor:pointer;padding:0;margin-left:8px;';
    charName2Input.style.display = settings.nameGradient ? 'inline-block' : 'none';
    charName2Input.addEventListener('input', () => { settings.charNameColor2 = charName2Input.value; saveSettingsDebounced(); });
    charNameRow.append(charNameLabel, charNameInput, charName2Input);
    inlineDrawerContent.append(charNameRow);

    // User name colors
    const userNameRow = document.createElement('div');
    userNameRow.classList.add('typing-setting-row');
    const userNameLabel = document.createElement('label');
    userNameLabel.textContent = t`User Name`;
    const userNameInput = document.createElement('input');
    userNameInput.type = 'color';
    userNameInput.value = settings.userNameColor || '#5cb85c';
    userNameInput.style.cssText = 'width:32px;height:32px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);cursor:pointer;padding:0;';
    userNameInput.addEventListener('input', () => { settings.userNameColor = userNameInput.value; saveSettingsDebounced(); });
    const userName2Input = document.createElement('input');
    userName2Input.type = 'color';
    userName2Input.value = settings.userNameColor2 || '#22c55e';
    userName2Input.style.cssText = 'width:32px;height:32px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);cursor:pointer;padding:0;margin-left:8px;';
    userName2Input.style.display = settings.nameGradient ? 'inline-block' : 'none';
    userName2Input.addEventListener('input', () => { settings.userNameColor2 = userName2Input.value; saveSettingsDebounced(); });
    userNameRow.append(userNameLabel, userNameInput, userName2Input);
    inlineDrawerContent.append(userNameRow);

    // ========== SOUND & ADVANCED ==========
    inlineDrawerContent.append(createHeader('� Sound & Advanced'));

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

    // Sound Theme dropdown
    inlineDrawerContent.append(
        createSelect(t`Sound Theme`, [
            { value: 'ios', label: 'iOS Click' },
            { value: 'mechanical', label: 'Mechanical' },
            { value: 'retro', label: 'Retro Terminal' },
            { value: 'soft', label: 'Soft Taps' },
            { value: 'osu', label: 'Osu!' },
        ], settings.soundTheme, v => settings.soundTheme = v)
    );

    inlineDrawerContent.append(
        createCheckbox(t`Simulate Typing Pauses`, settings.simulatePauses, v => settings.simulatePauses = v)
    );

    inlineDrawerContent.append(
        createCheckbox(t`Mobile Optimized Mode`, settings.mobileMode, v => {
            settings.mobileMode = v;
            updateMobileMode(v);
        })
    );

    inlineDrawerContent.append(
        createCheckbox(t`Group Chat Support`, settings.groupChatSupport, v => settings.groupChatSupport = v)
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
        userTypingTimeout = null;
    }

    let indicator = document.getElementById('typing_indicator_user');

    // Only update DOM if indicator doesn't exist
    if (!indicator) {
        // Get indicator content with unified styling
        const htmlContent = generateIndicatorHTML(settings, true);

        indicator = document.createElement('div');
        indicator.id = 'typing_indicator_user';
        const alignClass = settings.userRightAlign ? 'right-aligned' : '';
        indicator.className = `typing_indicator_plus typing-user-indicator typing-position-${settings.position} typing-style-${settings.style} ${alignClass} visible`;
        indicator.innerHTML = htmlContent;

        // Apply user glow color (or disable glow)
        if (settings.glowEnabled !== false) {
            indicator.style.setProperty('--indicator-glow', settings.userGlowColor || '#5cb85c');
        } else {
            indicator.style.setProperty('--indicator-glow', 'transparent');
        }

        const sendForm = document.getElementById('send_form');
        if (sendForm) {
            sendForm.parentNode.insertBefore(indicator, sendForm);
        }
    }

    // Hide after configured timeout
    userTypingTimeout = setTimeout(() => {
        hideUserTypingIndicator();
    }, settings.userTypingTimeoutMs || 600);
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
    const chunkEvents = [event_types.CHARACTER_MESSAGE_RENDERED];

    showEvents.forEach(e => eventSource.on(e, showTypingIndicator));
    hideEvents.forEach(e => {
        eventSource.on(e, () => {
            typingCharacters.clear();
            hideTypingIndicator();
        });
    });
    chunkEvents.forEach(e => eventSource.on(e, handleMessageChunk));

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

