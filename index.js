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
    userSoundEnabled: false,
    userSoundTheme: 'ios',

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
    dynamicRhythm: false,      // More varied sound timing
    soundOnStreamStart: false, // Wait for streaming to start before playing sounds

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
let soundsPendingStream = false;  // Flag for streaming-aware sounds

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
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="16" viewBox="0 0 32 16" style="overflow:visible;">
                <style>
                    ${anim.keyframes}
                    .typing-dot-1 { animation: ${animName} ${anim.duration} ${anim.timing} 0s infinite; }
                    .typing-dot-2 { animation: ${animName} ${anim.duration} ${anim.timing} 0.15s infinite; }
                    .typing-dot-3 { animation: ${animName} ${anim.duration} ${anim.timing} 0.3s infinite; }
                </style>
                <circle class="typing-dot-1" cx="6" cy="8" r="3" fill="currentColor"/>
                <circle class="typing-dot-2" cx="16" cy="8" r="3" fill="currentColor"/>
                <circle class="typing-dot-3" cx="26" cy="8" r="3" fill="currentColor"/>
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
        if (settings.soundOnStreamStart) {
            // Defer sound until streaming starts
            soundsPendingStream = true;
        } else {
            // Play immediately
            startTypingSounds(settings);
        }
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

/**
 * Start typing sounds (called immediately or on stream start)
 */
function startTypingSounds(settings) {
    if (soundInterval) return; // Already playing

    playTypingSound(settings.soundVolume, settings.soundTheme);

    // Schedule repeating sounds with optional dynamic rhythm
    const scheduleNextSound = () => {
        if (!isIndicatorVisible || !settings.soundEnabled) return;

        const interval = settings.dynamicRhythm
            ? 150 + Math.random() * 450  // 150-600ms varied
            : 300 + Math.random() * 200; // 300-500ms standard

        soundInterval = setTimeout(() => {
            if (isIndicatorVisible && settings.soundEnabled) {
                playTypingSound(settings.soundVolume * (0.6 + Math.random() * 0.4), settings.soundTheme);
                scheduleNextSound();
            }
        }, interval);
    };

    scheduleNextSound();
}

/**
 * Handle streaming token received - trigger sounds if pending
 */
function handleStreamToken() {
    const settings = getSettings();
    if (soundsPendingStream && isIndicatorVisible && settings.soundEnabled) {
        soundsPendingStream = false;
        startTypingSounds(settings);
    }
}

function clearTimers() {
    if (pauseTimeout) {
        clearTimeout(pauseTimeout);
        pauseTimeout = null;
    }
    if (soundInterval) {
        clearTimeout(soundInterval); // Changed to clearTimeout for dynamic scheduling
        soundInterval = null;
    }
    if (thinkingObserver) {
        thinkingObserver.disconnect();
        thinkingObserver = null;
    }
    // Always reset flags when clearing
    isCharThinking = false;
    soundsPendingStream = false;
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

    // Helper to create collapsible drawer section
    const createDrawerSection = (title, startOpen = false) => {
        const drawer = document.createElement('div');
        drawer.style.cssText = 'margin-top:8px;padding:8px;background:rgba(0,0,0,0.15);border-radius:6px;';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:4px 0;';
        header.innerHTML = `<span style="font-weight:600;font-size:12px;">${title}</span><i class="fa-solid fa-chevron-down" style="font-size:10px;transition:transform 0.2s;"></i>`;

        const content = document.createElement('div');
        content.style.cssText = startOpen ? 'display:block;margin-top:8px;' : 'display:none;margin-top:8px;';

        if (startOpen) {
            header.querySelector('i').style.transform = 'rotate(180deg)';
        }

        let isOpen = startOpen;
        header.addEventListener('click', () => {
            isOpen = !isOpen;
            content.style.display = isOpen ? 'block' : 'none';
            header.querySelector('i').style.transform = isOpen ? 'rotate(180deg)' : '';
        });

        drawer.append(header, content);

        return { drawer, content };
    };

    // ========== GENERAL ==========
    const generalDrawer = createDrawerSection('⚙️ General', true); // Start open
    inlineDrawerContent.append(generalDrawer.drawer);

    generalDrawer.content.append(
        createCheckbox(t`Enabled`, settings.enabled, v => settings.enabled = v)
    );

    generalDrawer.content.append(
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

    generalDrawer.content.append(
        createSelect(t`Position`, [
            { value: 'bottom', label: 'Bottom (Sticky)' },
            { value: 'inline', label: 'Inline (After Messages)' },
            { value: 'floating', label: 'Floating (Overlay)' },
        ], settings.position, v => settings.position = v)
    );

    generalDrawer.content.append(
        createSelect(t`Animation Theme`, [
            { value: 'smooth', label: 'Smooth' },
            { value: 'playful', label: 'Playful (Bouncy)' },
            { value: 'minimal', label: 'Minimal' },
            { value: 'wave', label: 'Wave' },
        ], settings.animationTheme, v => settings.animationTheme = v)
    );

    // ========== CHARACTER INDICATOR ==========
    const charDrawer = createDrawerSection('🤖 Character Indicator');
    inlineDrawerContent.append(charDrawer.drawer);

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
    charDrawer.content.append(charTextRow);

    charDrawer.content.append(
        createCheckbox(t`Show Character Avatar`, settings.showAvatar, v => settings.showAvatar = v)
    );

    // Thinking detection subsection
    charDrawer.content.append(
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
    charDrawer.content.append(charThinkingTextRow);

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
    charDrawer.content.append(thinkingIconRow);

    // ========== USER INDICATOR ==========
    const userDrawer = createDrawerSection('👤 User Indicator');
    inlineDrawerContent.append(userDrawer.drawer);

    userDrawer.content.append(
        createCheckbox(t`Enable User Typing Indicator`, settings.userTypingEnabled, v => settings.userTypingEnabled = v)
    );

    userDrawer.content.append(
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
    userDrawer.content.append(userTextRow);

    userDrawer.content.append(
        createCheckbox(t`Show User Avatar`, settings.showUserAvatar, v => settings.showUserAvatar = v)
    );

    userDrawer.content.append(
        createNumberInput(t`Idle Timeout (ms)`, settings.userTypingTimeoutMs || 600, '600', v => settings.userTypingTimeoutMs = v)
    );

    // User Sound settings
    const userSoundCheckbox = createCheckbox(t`Enable User Typing Sounds`, settings.userSoundEnabled, v => {
        settings.userSoundEnabled = v;
        userSoundThemeRow.style.display = v ? 'block' : 'none';
    });
    userDrawer.content.append(userSoundCheckbox);

    const userSoundThemeRow = createSelect(t`User Sound Theme`, [
        { value: 'ios', label: 'iOS Click' },
        { value: 'mechanical', label: 'Mechanical' },
        { value: 'retro', label: 'Retro Terminal' },
        { value: 'soft', label: 'Soft Taps' },
        { value: 'osu', label: 'Osu!' },
    ], settings.userSoundTheme || 'ios', v => settings.userSoundTheme = v);
    userSoundThemeRow.style.display = settings.userSoundEnabled ? 'block' : 'none';
    userDrawer.content.append(userSoundThemeRow);

    // ========== VISUAL EFFECTS ==========
    const visualDrawer = createDrawerSection('✨ Visual Effects');
    inlineDrawerContent.append(visualDrawer.drawer);

    // Glow settings with toggle
    const glowCheckbox = createCheckbox(t`Enable Glow Effect`, settings.glowEnabled !== false, v => {
        settings.glowEnabled = v;
        colorDrawer.style.display = v ? 'block' : 'none';
    });
    visualDrawer.content.append(glowCheckbox);

    // Name gradient toggle
    const nameGradientCheckbox = createCheckbox(t`Gradient Name Colors`, settings.nameGradient || false, v => {
        settings.nameGradient = v;
        // Toggle visibility of gradient color inputs
        document.querySelectorAll('.tip-gradient-color').forEach(el => {
            el.style.display = v ? 'block' : 'none';
        });
        saveSettingsDebounced();
    });
    visualDrawer.content.append(nameGradientCheckbox);

    // Glow gradient toggle  
    const glowGradientCheckbox = createCheckbox(t`Gradient Glow`, settings.glowGradient || false, v => {
        settings.glowGradient = v;
        // Toggle visibility of glow gradient inputs
        document.querySelectorAll('.tip-glow-gradient-color').forEach(el => {
            el.style.display = v ? 'block' : 'none';
        });
        saveSettingsDebounced();
    });
    visualDrawer.content.append(glowGradientCheckbox);

    // ===== COLLAPSIBLE COLOR SETTINGS DRAWER =====
    const colorDrawer = document.createElement('div');
    colorDrawer.className = 'tip-color-drawer';
    colorDrawer.style.cssText = 'margin-top:8px;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px;';
    colorDrawer.style.display = settings.glowEnabled !== false ? 'block' : 'none';

    // Drawer toggle header
    const colorDrawerHeader = document.createElement('div');
    colorDrawerHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:4px 0;';
    colorDrawerHeader.innerHTML = '<span style="font-weight:600;font-size:12px;">🎨 Color Settings</span><i class="fa-solid fa-chevron-down" style="font-size:10px;transition:transform 0.2s;"></i>';

    const colorDrawerContent = document.createElement('div');
    colorDrawerContent.style.cssText = 'display:none;margin-top:8px;';

    let colorDrawerOpen = false;
    colorDrawerHeader.addEventListener('click', () => {
        colorDrawerOpen = !colorDrawerOpen;
        colorDrawerContent.style.display = colorDrawerOpen ? 'block' : 'none';
        colorDrawerHeader.querySelector('i').style.transform = colorDrawerOpen ? 'rotate(180deg)' : '';
    });

    colorDrawer.append(colorDrawerHeader, colorDrawerContent);

    // Helper for square color input
    const createSquareColor = (value, onChange, extraClass = '') => {
        const input = document.createElement('input');
        input.type = 'color';
        input.value = value;
        input.className = extraClass;
        input.style.cssText = 'width:36px;height:36px;border-radius:4px;border:2px solid rgba(255,255,255,0.15);cursor:pointer;padding:0;background:transparent;';
        input.addEventListener('input', () => { onChange(input.value); saveSettingsDebounced(); });
        return input;
    };

    // Helper for color row with grid
    const createColorRow = (label, colors) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
        const lbl = document.createElement('span');
        lbl.style.cssText = 'font-size:12px;opacity:0.9;';
        lbl.textContent = label;
        const colorBox = document.createElement('div');
        colorBox.style.cssText = 'display:flex;gap:6px;';
        colors.forEach(c => colorBox.appendChild(c));
        row.append(lbl, colorBox);
        return row;
    };

    // Character Glow colors
    const charGlow1 = createSquareColor(settings.glowColor || '#738adb', v => { settings.glowColor = v; updateActiveGlowColors(v); });
    const charGlow2 = createSquareColor(settings.glowColor2 || '#a855f7', v => settings.glowColor2 = v, 'tip-glow-gradient-color');
    charGlow2.style.display = settings.glowGradient ? 'block' : 'none';
    colorDrawerContent.append(createColorRow('Character Glow', [charGlow1, charGlow2]));

    // User Glow colors
    const userGlow1 = createSquareColor(settings.userGlowColor || '#5cb85c', v => settings.userGlowColor = v);
    const userGlow2 = createSquareColor(settings.userGlowColor2 || '#22c55e', v => settings.userGlowColor2 = v, 'tip-glow-gradient-color');
    userGlow2.style.display = settings.glowGradient ? 'block' : 'none';
    colorDrawerContent.append(createColorRow('User Glow', [userGlow1, userGlow2]));

    // Divider
    const divider = document.createElement('div');
    divider.style.cssText = 'border-top:1px solid rgba(255,255,255,0.1);margin:10px 0;';
    colorDrawerContent.append(divider);

    // Character Name colors
    const charName1 = createSquareColor(settings.charNameColor || '#738adb', v => settings.charNameColor = v);
    const charName2 = createSquareColor(settings.charNameColor2 || '#a855f7', v => settings.charNameColor2 = v, 'tip-gradient-color');
    charName2.style.display = settings.nameGradient ? 'block' : 'none';
    colorDrawerContent.append(createColorRow('Character Name', [charName1, charName2]));

    // User Name colors
    const userName1 = createSquareColor(settings.userNameColor || '#5cb85c', v => settings.userNameColor = v);
    const userName2 = createSquareColor(settings.userNameColor2 || '#22c55e', v => settings.userNameColor2 = v, 'tip-gradient-color');
    userName2.style.display = settings.nameGradient ? 'block' : 'none';
    colorDrawerContent.append(createColorRow('User Name', [userName1, userName2]));

    visualDrawer.content.append(colorDrawer);

    // ========== SOUND & ADVANCED ==========
    const soundDrawer = createDrawerSection('🔊 Sound & Advanced');
    inlineDrawerContent.append(soundDrawer.drawer);

    // Sound checkbox
    const soundCheckbox = createCheckbox(t`Enable Character Typing Sounds`, settings.soundEnabled, v => {
        settings.soundEnabled = v;
        volumeRow.style.display = v ? 'flex' : 'none';
    });
    soundDrawer.content.append(soundCheckbox);

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
    soundDrawer.content.append(volumeRow);

    // Sound Theme dropdown
    soundDrawer.content.append(
        createSelect(t`Character Sound Theme`, [
            { value: 'ios', label: 'iOS Click' },
            { value: 'mechanical', label: 'Mechanical' },
            { value: 'retro', label: 'Retro Terminal' },
            { value: 'soft', label: 'Soft Taps' },
            { value: 'osu', label: 'Osu!' },
        ], settings.soundTheme, v => settings.soundTheme = v)
    );

    soundDrawer.content.append(
        createCheckbox(t`Simulate Typing Pauses`, settings.simulatePauses, v => settings.simulatePauses = v)
    );

    soundDrawer.content.append(
        createCheckbox(t`Dynamic Sound Rhythm`, settings.dynamicRhythm, v => settings.dynamicRhythm = v)
    );

    soundDrawer.content.append(
        createCheckbox(t`Sound on Stream Start`, settings.soundOnStreamStart, v => settings.soundOnStreamStart = v)
    );

    soundDrawer.content.append(
        createCheckbox(t`Mobile Optimized Mode`, settings.mobileMode, v => {
            settings.mobileMode = v;
            updateMobileMode(v);
        })
    );

    soundDrawer.content.append(
        createCheckbox(t`Group Chat Support (Experimental)`, settings.groupChatSupport, v => settings.groupChatSupport = v)
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

    // Play sound on each keystroke if enabled
    if (settings.userSoundEnabled) {
        playTypingSound(settings.soundVolume * (0.7 + Math.random() * 0.3), settings.userSoundTheme || 'ios');
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

    // Streaming token event - trigger sounds when streaming starts
    eventSource.on(event_types.STREAM_TOKEN_RECEIVED, handleStreamToken);

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

